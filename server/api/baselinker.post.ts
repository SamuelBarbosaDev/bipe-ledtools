import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  // Lembre-se de colocar BASELINKER_TOKEN no seu .env
  const token = config.public.baselinkerToken || process.env.BASELINKER_TOKEN

  if (!token) {
    throw createError({ statusCode: 500, statusMessage: 'Token do Baselinker não configurado.' })
  }

  // 1. Descobre a data do último pedido sincronizado
  const lastOrder = await prisma.order.findFirst({
    orderBy: { dateConfirmed: 'desc' }
  })
  
  // Se não houver, busca dos últimos 3 dias (em Unix Timestamp)
  let dateConfirmedFrom = lastOrder ? lastOrder.dateConfirmed + 1 : Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60)

  let hasMoreOrders = true
  let totalImported = 0

  while (hasMoreOrders) {
    const params = new URLSearchParams()
    params.append('method', 'getOrders')
    params.append('parameters', JSON.stringify({
      date_confirmed_from: dateConfirmedFrom,
      get_unconfirmed_orders: false // Apenas pedidos confirmados
    }))

    try {
      const response = await fetch("https://api.baselinker.com/connector.php", {
        method: 'POST',
        headers: { 'X-BLToken': token },
        body: params
      })

      const data = await response.json()

      if (data.status === "SUCCESS" && data.orders && data.orders.length > 0) {
        for (const order of data.orders) {
          // Upsert: Atualiza se existir, cria se não existir
          await prisma.order.upsert({
            where: { id: order.order_id },
            update: {
              deliveryPackageNr: order.delivery_package_nr,
              status: order.order_status_id.toString(),
            },
            create: {
              id: order.order_id,
              externalOrderId: order.external_order_id,
              deliveryPackageNr: order.delivery_package_nr,
              status: order.order_status_id.toString(),
              dateConfirmed: order.date_confirmed,
              products: {
                create: order.products.map((p: any) => ({
                  ean: p.ean || null,
                  sku: p.sku || null,
                  name: p.name,
                  quantity: p.quantity
                }))
              }
            }
          })
          
          totalImported++
          dateConfirmedFrom = order.date_confirmed + 1
        }

        // Baselinker retorna max 100 por vez. Se vier menos, acabou.
        if (data.orders.length < 100) {
          hasMoreOrders = false
        }
      } else {
        hasMoreOrders = false
      }
    } catch (error) {
      console.error("Erro ao sincronizar com Baselinker:", error)
      throw createError({ statusCode: 500, statusMessage: 'Erro de conexão com a API' })
    }
  }

  return { success: true, message: `${totalImported} pedidos sincronizados com sucesso no banco local.` }
})