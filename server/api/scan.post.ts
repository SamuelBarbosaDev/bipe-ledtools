// server/api/scan.post.ts
import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const trackingCode = body.trackingCode?.trim()

  if (!trackingCode) {
    throw createError({ statusCode: 400, statusMessage: 'Código não fornecido.' })
  }

  // Busca rápida (usa o index do SQLite)
  const order = await prisma.order.findFirst({
    where: { deliveryPackageNr: trackingCode },
    include: { products: true }
  })

  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Pedido não encontrado ou sem código de rastreio.' })
  }

  return {
    success: true,
    order
  }
})