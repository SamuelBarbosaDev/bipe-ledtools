import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const token = config.public.baselinkerToken || process.env.BASELINKER_TOKEN

  if (!token) throw createError({ statusCode: 500, statusMessage: 'Token não configurado.' })

  // Pega a última data de confirmação
  const lastOrderQuery = db.prepare('SELECT dateConfirmed FROM "Order" ORDER BY dateConfirmed DESC LIMIT 1')
  const lastOrder = lastOrderQuery.get() as { dateConfirmed: number } | undefined
  
  let dateConfirmedFrom = lastOrder ? lastOrder.dateConfirmed + 1 : Math.floor(Date.now() / 1000) - (20 * 24 * 60 * 60)

  let hasMoreOrders = true
  let totalImported = 0

  // Prepara as queries SQL (isso deixa a inserção muito mais rápida)
  const upsertOrder = db.prepare(`
    INSERT INTO "Order" (id, externalOrderId, deliveryPackageNr, status, dateConfirmed) 
    VALUES (@id, @externalOrderId, @deliveryPackageNr, @status, @dateConfirmed)
    ON CONFLICT(id) DO UPDATE SET 
      deliveryPackageNr = excluded.deliveryPackageNr,
      status = excluded.status
  `)

  const insertProduct = db.prepare(`
    INSERT INTO Product (id, orderId, ean, sku, name, quantity) 
    VALUES (@id, @orderId, @ean, @sku, @name, @quantity)
  `)

  const deleteProducts = db.prepare('DELETE FROM Product WHERE orderId = ?')

  while (hasMoreOrders) {
    const params = new URLSearchParams()
    params.append('method', 'getOrders')
    params.append('parameters', JSON.stringify({
      date_confirmed_from: dateConfirmedFrom,
      get_unconfirmed_orders: false
    }))

    try {
      const response = await fetch("https://api.baselinker.com/connector.php", {
        method: 'POST',
        headers: { 'X-BLToken': token },
        body: params
      })

      const data = await response.json()

      if (data.status === "SUCCESS" && data.orders && data.orders.length > 0) {
        
        // Transação para salvar tudo de uma vez com segurança
        const saveOrders = db.transaction((orders) => {
          for (const order of orders) {
            upsertOrder.run({
              id: order.order_id,
              externalOrderId: order.external_order_id,
              deliveryPackageNr: order.delivery_package_nr,
              status: order.order_status_id.toString(),
              dateConfirmed: order.date_confirmed
            })

            // Limpa os produtos antigos e insere os novos (evita duplicatas na atualização)
            deleteProducts.run(order.order_id)
            
            for (const p of order.products) {
              insertProduct.run({
                id: randomUUID(),
                orderId: order.order_id,
                ean: p.ean || null,
                sku: p.sku || null,
                name: p.name,
                quantity: p.quantity
              })
            }
          }
        })

        saveOrders(data.orders)
        
        totalImported += data.orders.length
        dateConfirmedFrom = data.orders[data.orders.length - 1].date_confirmed + 1

        if (data.orders.length < 100) hasMoreOrders = false
      } else {
        hasMoreOrders = false
      }
    } catch (error) {
      console.error("Erro na API:", error)
      throw createError({ statusCode: 500, statusMessage: 'Erro de conexão' })
    }
  }

  return { success: true, message: `${totalImported} pedidos sincronizados.` }
})