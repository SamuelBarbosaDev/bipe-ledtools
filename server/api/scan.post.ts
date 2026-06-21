import { db } from '../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const scannedCode = body.trackingCode?.trim()

  if (!scannedCode) {
    throw createError({ statusCode: 400, statusMessage: 'Código não fornecido.' })
  }

  // A MÁGICA AQUI: O SQL usa "OR" para buscar nas duas colunas simultaneamente
  const orderQuery = db.prepare(`
    SELECT * FROM "Order" 
    WHERE deliveryPackageNr = ? OR externalOrderId = ?
  `)
  
  // Passamos o mesmo código duas vezes para substituir os dois "?" na query
  const order = orderQuery.get(scannedCode, scannedCode) as any

  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Pedido ou Rastreio não encontrado.' })
  }

  // Busca os produtos atrelados a este pedido
  const productsQuery = db.prepare('SELECT * FROM Product WHERE orderId = ?')
  const products = productsQuery.all(order.id)

  return {
    success: true,
    order: {
      ...order,
      products
    }
  }
})