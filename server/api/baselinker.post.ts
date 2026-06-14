// server/api/baselinker.post.ts
import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const externalOrderId = body.externalOrderId

  // 1. Puxa as configurações de runtime
  const config = useRuntimeConfig()
  
  // 2. Acessa o token que configuramos
  const API_TOKEN = config.apiToken

  const BASELINKER_URL = "https://api.baselinker.com/connector.php"

  try {
    const response = await $fetch(BASELINKER_URL, {
      method: 'POST',
      headers: { 'X-BLToken': API_TOKEN },
      body: new URLSearchParams({
        method: 'getOrders',
        parameters: JSON.stringify({ filter_external_order_id: externalOrderId })
      })
    })

    if (response.status === 'SUCCESS' && response.orders.length > 0) {
      return { success: true, order: response.orders[0] }
    } else {
      return { success: false, message: 'Pedido não encontrado.' }
    }
  } catch (error) {
    return { success: false, message: 'Erro na API.' }
  }
})