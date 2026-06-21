<template>
  <div class="layout" :class="{ 'error-mode': errorMessage }">
    
    <header class="header">
      <img src="/let-tools.jpg" alt="Led Tools" class="logo" /> 
      <div class="user-info">
        <span class="user-role">Conferência</span>
        <img src="/mascote.png" alt="Mascote" class="mascote" />
      </div>
    </header>

    <main class="main-container">
      
      <button class="btn-primary" @click="syncOrders" :disabled="isSyncing" style="margin-bottom: 2rem;">
        {{ isSyncing ? 'Sincronizando com BaseLinker...' : 'Sincronizar Pedidos' }}
      </button>

      <div v-if="successMessage && isOrderComplete" class="card success-card">
        <h2>Caixa Fechada!</h2>
        <p>{{ successMessage }}</p>
      </div>

      <div class="card search-card" :class="{ 'ean-card': currentOrder }" v-show="!isOrderComplete">
        <h1>{{ currentOrder ? 'Bipar Produto (EAN)' : 'Bipar Etiqueta' }}</h1>
        <div class="input-group">
          <input 
            ref="scannerInputRef"
            v-model="scannedCode"
            @keyup.enter="handleScan"
            type="text" 
            autofocus
            class="large-input"
            :class="{ 'ean-input': currentOrder }"
            :placeholder="currentOrder ? 'Bipe o EAN do produto...' : 'ID do Pedido ou Rastreio...'"
          />
          <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>
          <p v-if="successMessage && !isOrderComplete" style="color: var(--success-color); font-weight: bold; margin-top: 1rem;">
            {{ successMessage }}
          </p>
        </div>
      </div>

      <div v-if="currentOrder">
        
        <div class="card info-card">
          <div class="info-block">
            <span class="label">Pedido</span>
            <span class="value">{{ currentOrder.externalOrderId || currentOrder.id }}</span>
          </div>
          <div class="info-block right">
            <span class="label">Rastreio</span>
            <span class="value" style="font-size: 1rem;">{{ currentOrder.deliveryPackageNr || 'Sem rastreio' }}</span>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 1.5rem;">
          <button @click="resetConference" style="background: var(--error-bg); color: white; padding: 0.5rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
            Cancelar Conferência
          </button>
        </div>

        <div class="progress-container">
          <div class="progress-header">
            <span>Progresso da Caixa</span>
            <span>{{ totalScanned }} / {{ totalRequired }}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: progressPercentage + '%' }"></div>
          </div>
        </div>

        <div class="product-list">
          <div 
            v-for="product in currentOrder.products" 
            :key="product.id" 
            class="product-card" 
            :class="{ 'product-done': product.checked }"
          >
            <div class="product-details">
              <div class="product-sku">{{ product.sku || 'SEM SKU' }}</div>
              <div class="product-name">{{ product.name }}</div>
              <div class="product-ean">{{ product.ean || 'EAN não cadastrado' }}</div>
            </div>
            <div class="product-qty">
              <span class="qty-label">Qtd</span>
              <div class="qty-numbers">
                <span class="qty-current">{{ product.currentQty }}</span>
                <span class="qty-divider">/</span>
                <span class="qty-total">{{ product.quantity }}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
    
    <audio ref="errorAudioRef" src="/alert.mp3"></audio>
  </div>
</template>

<script setup>
// 1. Adicione o 'watch' na importação do vue
import { ref, computed, onMounted, watch, nextTick } from 'vue'

// ... suas importações de css ...
import '~/assets/css/main.css'
import '~/assets/css/index.css'

// ... suas variáveis (refs) ...
const scannerInputRef = ref(null)
const errorAudioRef = ref(null)
const scannedCode = ref('')
const currentOrder = ref(null)
const errorMessage = ref('')
const successMessage = ref('')
const isSyncing = ref(false)

// 2. Crie a variável para o temporizador
let scanTimeout = null

// 3. Adicione o observador (Auto Submit)
watch(scannedCode, (newVal) => {
  // Se o campo estiver vazio, não faz nada
  if (!newVal || newVal.trim() === '') return

  // Limpa a contagem anterior enquanto os caracteres estiverem entrando rápido
  clearTimeout(scanTimeout)

  // Inicia a contagem. 200ms de pausa significa que o leitor terminou de "digitar"
  scanTimeout = setTimeout(() => {
    handleScan()
  }, 1000)
})

// Mantém o foco no input
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

// Lógica de progresso da caixa
const totalRequired = computed(() => {
  if (!currentOrder.value) return 0
  return currentOrder.value.products.reduce((acc, p) => acc + p.quantity, 0)
})

const totalScanned = computed(() => {
  if (!currentOrder.value) return 0
  return currentOrder.value.products.reduce((acc, p) => acc + p.currentQty, 0)
})

const progressPercentage = computed(() => {
  if (totalRequired.value === 0) return 0
  return (totalScanned.value / totalRequired.value) * 100
})

const isOrderComplete = computed(() => {
  return totalRequired.value > 0 && totalScanned.value === totalRequired.value
})

const syncOrders = async () => {
  isSyncing.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const res = await $fetch('/api/baselinker', { method: 'POST' })
    successMessage.value = res.message
  } catch (error) {
    errorMessage.value = 'Erro ao sincronizar dados do BaseLinker.'
    playErrorSound()
  } finally {
    isSyncing.value = false
    scannerInputRef.value?.focus()
  }
}

const handleScan = async () => {
  const code = scannedCode.value.trim()
  scannedCode.value = '' 
  errorMessage.value = ''
  successMessage.value = ''

  if (!code) return

  // CENÁRIO 1: Procurando Pedido (Busca Rastreio OU ID Externo)
  if (!currentOrder.value) {
    try {
      const response = await $fetch('/api/scan', {
        method: 'POST',
        body: { trackingCode: code }
      })
      
      const orderData = response.order
      // Inicializa a quantidade atual e a flag de checado
      orderData.products = orderData.products.map(p => ({ 
        ...p, 
        currentQty: 0,
        checked: false 
      }))
      
      currentOrder.value = orderData
      successMessage.value = 'Pedido encontrado! Inicie a bipagem.'
    } catch (error) {
      playErrorSound()
      errorMessage.value = 'Etiqueta ou Pedido não encontrado no banco local.'
    }
  } 
  // CENÁRIO 2: Conferindo Produtos (EAN)
  else {
    let productFound = false

    for (const product of currentOrder.value.products) {
      // Verifica se o EAN bate e se ainda precisa bipar mais unidades desse item
      if (product.ean === code && product.currentQty < product.quantity) {
        product.currentQty += 1
        
        if (product.currentQty === product.quantity) {
          product.checked = true
        }
        
        productFound = true
        successMessage.value = 'Produto conferido!'
        break // Sai para contabilizar 1 por vez
      }
    }

    if (!productFound) {
      playErrorSound()
      // Verifica se o EAN existe, mas já foi bipado o limite
      const overLimit = currentOrder.value.products.some(p => p.ean === code && p.currentQty >= p.quantity)
      if (overLimit) {
        errorMessage.value = 'Quantidade máxima deste produto já atingida!'
      } else {
        errorMessage.value = 'EAN inválido ou não pertence a este pedido!'
      }
      return
    }

    if (isOrderComplete.value) {
      successMessage.value = 'PEDIDO 100% CONFERIDO! Fechando caixa...'
      setTimeout(() => {
        resetConference()
      }, 3000)
    }
  }
}

const resetConference = async () => {
  currentOrder.value = null
  scannedCode.value = ''
  errorMessage.value = ''
  successMessage.value = ''
  
  // Aguarda o Vue re-renderizar a tela (voltar para o modo 'Etiqueta')
  await nextTick() 
  
  // Agora sim, foca no input com segurança
  scannerInputRef.value?.focus()
}
</script>