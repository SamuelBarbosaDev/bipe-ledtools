import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

# Configurações da API do BaseLinker
BASELINKER_URL = "https://api.baselinker.com/connector.php"
API_TOKEN = os.environ.get("BASELINKER_TOKEN")  # Substitua pelo token gerado no painel

def buscar_pedido_baselinker(external_order_id):
    """Busca um pedido na API usando o ID Externo (Marketplace/Loja)."""
    headers = {
        "X-BLToken": API_TOKEN
    }

    # Alterado para filter_external_order_id
    payload = {
        "method": "getOrders",
        "parameters": json.dumps({
            "filter_external_order_id": external_order_id
        }),
    }

    try:
        response = requests.post(BASELINKER_URL, headers=headers, data=payload)
        response.raise_for_status()
        resultado = response.json()

        if (
            resultado.get("status") == "SUCCESS"
            and len(resultado.get("orders", [])) > 0
        ):
            return resultado["orders"][0]
        else:
            print(f"❌ Pedido externo '{external_order_id}' não encontrado ou erro na API.")
            return None
    except Exception as e:
        print(f"💥 Erro de conexão com a API do BaseLinker: {e}")
        return None


def iniciar_conferencia():
    print("==================================================")
    print("    SISTEMA DE CONFERÊNCIA DE PEDIDOS - LED.TOOLS ")
    print("==================================================")

    # Passo 1: Identificar o pedido pelo ID Externo
    # Removido o .isdigit() porque códigos da Shopee/Amazon têm letras
    id_externo = input("👉 Escaneie o Número do Pedido Externo (Ex: Shopee, Meli): ").strip()
    
    if not id_externo:
        print("❌ ID do pedido inválido.")
        return

    print("\n🔄 Buscando dados no BaseLinker...")
    pedido = buscar_pedido_baselinker(id_externo)

    if not pedido:
        return

    # O retorno da API mostra o ID interno e o externo para confirmação visual [cite: 61]
    print(f"\n✅ Pedido Externo {pedido['external_order_id']} carregado!")
    print(f"🔗 ID BaseLinker: {pedido['order_id']}")
    print(f"👤 Cliente: {pedido['delivery_fullname']}")
    print(f"📦 Canal: {pedido['order_source'].upper()}")
    print("--------------------------------------------------")

    # Mapear os produtos que precisam ser conferidos
    lista_conferencia = {}
    for produto in pedido.get("products", []):
        ean = produto.get("ean", "").strip()
        sku = produto.get("sku", "").strip()

        # Estratégia de Fallback: Se o EAN estiver zerado, mapeia pelo SKU
        chave_identificadora = ean if ean else sku

        if not chave_identificadora:
            print(f"⚠️ Alerta: Produto '{produto['name']}' não tem EAN nem SKU. Não poderá ser bipado!")
            continue

        # Agrupar quantidades caso o mesmo SKU venha repetido em linhas diferentes
        if chave_identificadora in lista_conferencia:
            lista_conferencia[chave_identificadora]["quantidade_total"] += produto["quantity"]
        else:
            lista_conferencia[chave_identificadora] = {
                "nome": produto["name"],
                "sku": sku,
                "quantidade_total": produto["quantity"],
                "quantidade_conferida": 0,
            }

    if not lista_conferencia:
        print("❌ Sem produtos válidos para conferir neste pedido.")
        return

    # Passo 2 & 3: Loop de bipes dos itens
    while True:
        # Verifica se ainda restam itens pendentes
        itens_pendentes = [
            item
            for item in lista_conferencia.values()
            if item["quantidade_conferida"] < item["quantidade_total"]
        ]

        if not itens_pendentes:
            print("\n🎉 EXCELENTE! Pedido 100% conferido e pronto para envio!")
            print("==================================================")
            break

        print("\n📋 Itens restantes para bipar:")
        for chave, item in lista_conferencia.items():
            # A chave corrigida de quantity_total para quantidade_total
            falta = item["quantidade_total"] - item["quantidade_conferida"]
            if falta > 0:
                print(f"  • [{item['sku']}] {item['nome']} (Faltam: {falta})")

        bipe = input("\n📸 Bipe o código EAN (ou digite 'SAIR'): ").strip().upper()

        if bipe == "SAIR":
            print("\n⚠️ Conferência interrompida pelo operador.")
            break

        # Validando o produto bipado
        if bipe in lista_conferencia:
            item = lista_conferencia[bipe]
            if item["quantidade_conferida"] < item["quantidade_total"]:
                item["quantidade_conferida"] += 1
                print(f"🟢 OK! +1 un. de {item['nome']} ({item['quantidade_conferida']}/{item['quantidade_total']})")
            else:
                print(f"🟡 ATENÇÃO: O item {item['sku']} já foi totalmente conferido!")
        else:
            print(f"🔴 ERRO CRÍTICO: Código '{bipe}' NÃO pertence a este pedido!")

if __name__ == "__main__":
    iniciar_conferencia()