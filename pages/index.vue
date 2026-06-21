<template>
  <div class="min-h-screen bg-gray-100 p-8 flex flex-col items-center">
    <div class="w-full max-w-3xl bg-white shadow-lg rounded-xl p-6">
      
      <!-- Cabeçalho e Sincronização -->
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Conferência Led Tools</h1>
        <button 
          @click="syncOrders" 
          :disabled="isSyncing"
          class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
        >
          {{ isSyncing ? 'Sincronizando...' : 'Sincronizar Baselinker' }}
        </button>
      </div>

      <!-- Área de Bipagem -->
      <div class="bg-blue-50 p-6 rounded-lg mb-6 border-2 border-blue-200">
        <label class="block text-sm font-bold text-blue-800 mb-2">
          {{ currentOrder ? 'Aguardando Bipagem do EAN do Produto' : 'Aguardando Bipagem do Rastreio da Etiqueta' }}
        </label>
        <input 
          ref="scannerInputRef"
          v-model="scannedCode"
          @keyup.enter="handleScan"
          type="text" 
          autofocus
          class="w-full text-2xl p-4 border border-gray-300 rounded shadow-inner focus:outline-none focus:ring-4 focus:ring-blue-300"
          :placeholder="currentOrder ? 'Bipe o código de barras (EAN)...' : 'Bipe o rastreio (Ex: AMZB... ou BR26...)'"
        />
        <p v-if="errorMessage" class="text-red-600 font-bold mt-2">{{ errorMessage }}</p>
        <p v-if="successMessage" class="text-green-600 font-bold mt-2">{{ successMessage }}</p>
      </div>

      <!-- Detalhes do Pedido Atual -->
      <div v-if="currentOrder" class="mt-4">
        <div class="flex justify-between items-center bg-gray-800 text-white p-3 rounded-t-lg">
          <h2 class="font-bold">Pedido: {{ currentOrder.id }}</h2>
          <button @click="resetConference" class="text-sm bg-red-600 hover:bg-red-500 px-3 py-1 rounded">Cancelar Conferência</button>
        </div>
        
        <table class="w-full border-collapse border border-gray-300">
          <thead>
            <tr class="bg-gray-200">
              <th class="border p-2 text-left">Produto</th>
              <th class="border p-2 text-center">EAN Esperado</th>
              <th class="border p-2 text-center">Qtd</th>
              <th class="border p-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in currentOrder.products" :key="product.id" :class="{'bg-green-100': product.checked}">
              <td class="border p-2 text-sm">{{ product.name }}</td>
              <td class="border p-2 text-center font-mono text-sm">{{ product.ean || 'N/A' }}</td>
              <td class="border p-2 text-center">{{ product.quantity }}</td>
              <td class="border p-2 text-center">
                <span v-if="product.checked" class="text-green-600 font-bold">✓ Conferido</span>
                <span v-else class="text-orange-500 font-bold">Pendente</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
    
    <!-- Áudio de erro invisível -->
    <audio ref="errorAudioRef" src="/alert.mp3"></audio>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const scannerInputRef = ref(null)
const errorAudioRef = ref(null)

const scannedCode = ref('')
const currentOrder = ref(null)
const errorMessage = ref('')
const successMessage = ref('')
const isSyncing = ref(false)

// Mantém o foco no input sempre que a página for clicada (útil para o operador)
onMounted(() => {
  document.addEventListener('click', () => {
    scannerInputRef.value?.focus()
  })
})

const playErrorSound = () => {
  if (errorAudioRef.value) {
    errorAudioRef.value.currentTime = 0
    errorAudioRef.value.play()
  }
}

const syncOrders = async () => {
  isSyncing.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const res = await $fetch('/api/baselinker', { method: 'POST' })
    successMessage.value = res.message
  } catch (error) {
    errorMessage.value = 'Erro ao sincronizar dados.'
    playErrorSound()
  } finally {
    isSyncing.value = false
    scannerInputRef.value?.focus()
  }
}

const handleScan = async () => {
  const code = scannedCode.value.trim()
  scannedCode.value = '' // Limpa o input rapidamente
  errorMessage.value = ''
  successMessage.value = ''

  if (!code) return

  // CENÁRIO 1: Procurando um pedido (Bipando Rastreio)
  if (!currentOrder.value) {
    try {
      const response = await $fetch('/api/scan', {
        method: 'POST',
        body: { trackingCode: code }
      })
      
      // Adiciona flag visual de 'checked'
      const orderData = response.order
      orderData.products = orderData.products.map(p => ({ ...p, checked: false }))
      
      currentOrder.value = orderData
      successMessage.value = 'Pedido encontrado! Bipe os produtos.'
    } catch (error) {
      playErrorSound()
      errorMessage.value = error.data?.statusMessage || 'Etiqueta não encontrada no banco local.'
    }
  } 
  // CENÁRIO 2: Conferindo Produto (Bipando EAN)
  else {
    let productFound = false
    let allChecked = true

    for (const product of currentOrder.value.products) {
      if (product.ean === code && !product.checked) {
        product.checked = true
        productFound = true
        successMessage.value = 'Produto conferido com sucesso!'
        break // Sai do loop para marcar 1 quantidade por vez
      }
    }

    if (!productFound) {
      playErrorSound()
      errorMessage.value = 'EAN não pertence a este pedido ou já foi conferido!'
      return
    }

    // Verifica se a caixa toda foi conferida
    currentOrder.value.products.forEach(p => {
      if (!p.checked) allChecked = false
    })

    if (allChecked) {
      successMessage.value = 'PEDIDO 100% CONFERIDO! Fechando caixa...'
      // Timeout curto para o operador ver a mensagem de sucesso antes de resetar
      setTimeout(() => {
        resetConference()
      }, 2000)
    }
  }
}

const resetConference = () => {
  currentOrder.value = null
  scannedCode.value = ''
  errorMessage.value = ''
  successMessage.value = ''
  scannerInputRef.value?.focus()
}
</script>