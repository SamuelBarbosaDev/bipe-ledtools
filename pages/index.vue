<script setup lang="ts">
import { ref, nextTick, computed, onMounted } from 'vue'

// --- ESTADOS ---
const inputPedido = ref('')
const inputEan = ref('')
const pedidoData = ref<any>(null)
const listaConferencia = ref<Record<string, any>>({})
const errorMsg = ref('')
const hasErrorAlert = ref(false)
const conferenciaConcluida = ref(false)

// --- REFS PARA AUTO-FOCUS ---
const refInputPedido = ref<HTMLInputElement | null>(null)
const refInputEan = ref<HTMLInputElement | null>(null)

// Força o foco assim que a tela abre
onMounted(async () => {
  await nextTick()
  refInputPedido.value?.focus()
})

// --- LÓGICA DE BUSCA DO PEDIDO ---
const buscarPedido = async () => {
  if (!inputPedido.value.trim()) return
  
  errorMsg.value = ''
  pedidoData.value = null
  listaConferencia.value = {}
  conferenciaConcluida.value = false

  // Chamada à nossa API segura
  const { data } = await useFetch('/api/baselinker', {
    method: 'POST',
    body: { externalOrderId: inputPedido.value.trim() }
  })

  // Validação
  if (data.value?.success) {
    pedidoData.value = data.value.order
    montarMapaDeConferencia(pedidoData.value.products)
    
    // Foca no EAN após carregar a tela do pedido
    await nextTick()
    refInputEan.value?.focus()
  } else {
    dispararAlerta()
    errorMsg.value = 'Pedido não encontrado. Verifique se o número está correto.'
    inputPedido.value = ''
    await nextTick()
    refInputPedido.value?.focus()
  }
}

// --- MONTA MAPA DE CONFERÊNCIA ---
const montarMapaDeConferencia = (produtos: any[]) => {
  produtos.forEach(produto => {
    const chave = produto.ean?.trim() || produto.sku?.trim()
    if (!chave) return

    if (listaConferencia.value[chave]) {
      listaConferencia.value[chave].total += produto.quantity
    } else {
      listaConferencia.value[chave] = {
        nome: produto.name,
        sku: produto.sku,
        total: produto.quantity,
        conferido: 0
      }
    }
  })
}

// --- COMPUTEDS ---
const itensPendentes = computed(() => {
  return Object.values(listaConferencia.value).filter(i => i.conferido < i.total)
})

const progressoGeral = computed(() => {
  const itens = Object.values(listaConferencia.value)
  if (!itens.length) return 0
  const total = itens.reduce((acc, curr) => acc + curr.total, 0)
  const conferido = itens.reduce((acc, curr) => acc + curr.conferido, 0)
  return Math.round((conferido / total) * 100)
})

// --- LÓGICA DE BIPE DE EAN ---
const conferirEan = async () => {
  const bipado = inputEan.value.trim().toUpperCase()
  inputEan.value = '' // Limpa imediatamente

  if (!bipado) return

  const item = listaConferencia.value[bipado]

  if (item && item.conferido < item.total) {
    hasErrorAlert.value = false
    item.conferido += 1
    
    // VERIFICA SE FINALIZOU TUDO
    if (itensPendentes.value.length === 0) {
      conferenciaConcluida.value = true
      
      // Espera 1,5 segundos e reinicia o fluxo
      setTimeout(async () => {
        inputPedido.value = ''
        pedidoData.value = null
        listaConferencia.value = {}
        conferenciaConcluida.value = false
        
        // Foca novamente na busca do pedido
        await nextTick()
        refInputPedido.value?.focus()
      }, 900)
    }
  } else {
    dispararAlerta()
  }
}

// --- ALERTA VISUAL E SONORO ---
const dispararAlerta = () => {
  hasErrorAlert.value = true
  const audio = new Audio('/alert.mp3') 
  audio.play().catch(e => console.log('Áudio bloqueado', e))
  
  setTimeout(() => {
    hasErrorAlert.value = false
  }, 1500)
}
</script>

<template>
  <div class="layout" :class="{ 'error-mode': hasErrorAlert }">
    
    <header class="header">
      <img src="/let-tools.jpg" alt="Led.Tools" class="logo" />
      <div class="user-info">
        <span class="user-role">Operação Logística</span>
        <img src="/mascote.png" alt="Mascote" class="mascote" />
      </div>
    </header>

    <main class="main-container">
      
      <div v-if="conferenciaConcluida" class="card success-card">
        <h2>🎉 Pedido Conferido com Sucesso!</h2>
        <p>Preparando próximo pedido...</p>
      </div>

      <div v-if="!pedidoData && !conferenciaConcluida" class="card search-card">
        <h1>Conferência de Pedidos</h1>
        
        <div class="input-group">
          <input 
            ref="refInputPedido"
            v-model="inputPedido"
            @keyup.enter="buscarPedido"
            type="text" 
            autofocus
            placeholder="Bipe ou digite o número do pedido..."
            class="large-input"
          />
          <button @click="buscarPedido" class="btn-primary">
            Buscar Pedido
          </button>
          
          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        </div>
      </div>

      <div v-if="pedidoData && !conferenciaConcluida">
        
        <div class="card info-card">
          <div class="info-block">
            <span class="label">Pedido</span>
            <span class="value">{{ pedidoData.external_order_id }}</span>
          </div>
          <div class="info-block right">
            <span class="label">Cliente</span>
            <span class="value">{{ pedidoData.delivery_fullname }}</span>
          </div>
        </div>

        <div class="progress-container">
          <div class="progress-header">
            <span>Progresso</span>
            <span>{{ progressoGeral }}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: progressoGeral + '%' }"></div>
          </div>
        </div>

        <div class="card ean-card">
          <label class="label">Pronto para bipar produtos</label>
          <input 
            ref="refInputEan"
            v-model="inputEan"
            @keyup.enter="conferirEan"
            type="text" 
            placeholder="Bipe o EAN do produto..."
            class="large-input ean-input"
          />
        </div>

        <div class="product-list">
          <div 
            v-for="(item, key) in listaConferencia" :key="key"
            class="product-card"
            :class="{ 'product-done': item.conferido === item.total }"
          >
            <div class="product-details">
              <h3 class="product-sku">{{ item.sku }}</h3>
              <p class="product-name">{{ item.nome }}</p>
              <p class="product-ean">EAN: {{ key }}</p>
            </div>
            
            <div class="product-qty">
              <span class="qty-label">QTD</span>
              <div class="qty-numbers">
                <span class="qty-current">{{ item.conferido }}</span>
                <span class="qty-divider">/</span>
                <span class="qty-total">{{ item.total }}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div>
</template>

<style scoped src="~/assets/css/index.css"></style>