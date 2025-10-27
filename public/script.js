// public/script.js

const PROXY_URL = '/api'; // Será resolvido para /.netlify/functions/sptrans-proxy
let codigoLinhaAtiva = null;
let intervalId = null; // ID para o temporizador de atualização
let mapa = null;
let veiculosLayerGroup = null; // Grupo de camadas para gerenciar os marcadores de ônibus
const markers = {}; // Objeto para armazenar os marcadores de veículos por prefixo (p)

// --- Inicialização do Mapa Leaflet ---
function initMap() {
    // Coordenadas iniciais (Centro de São Paulo, aproximadamente)
    const initialCoords = [-23.5505, -46.6333]; 

    mapa = L.map('mapa').setView(initialCoords, 12);

    // Camada de Tiles (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapa);

    // Cria um grupo de camadas para os marcadores de veículos
    veiculosLayerGroup = L.layerGroup().addTo(mapa);
}

// Ícone personalizado para os ônibus
const busIcon = L.icon({
    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="%23007bff" d="M16 272c0 8.8 7.2 16 16 16H80V416H24c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h464c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16H432V288h48c8.8 0 16-7.2 16-16V224H16v48zM399.7 192l-21.7 48H134.1l-21.7-48H399.7zM480 192H32c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16h448c8.8 0 16 7.2 16 16v112c0 8.8-7.2 16-16 16zM112 112c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v16c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16v-16zM320 112c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v16c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16v-16z"/></svg>',
    iconSize: [32, 32], 
    iconAnchor: [16, 32], 
    popupAnchor: [0, -32]
});

// Inicializa o mapa quando a página carrega
document.addEventListener('DOMContentLoaded', initMap);


// --- Funções de Busca ---

async function buscarLinha() {
    const termo = document.getElementById('termoBusca').value;
    const msgLinha = document.getElementById('mensagem-linha');
    const resLinhas = document.getElementById('resultado-linhas');

    msgLinha.textContent = 'Buscando...';
    resLinhas.innerHTML = '';

    if (!termo) {
        msgLinha.textContent = 'Por favor, insira um termo de busca.';
        return;
    }

    try {
        const response = await fetch(`${PROXY_URL}/Linha/Buscar?termosBusca=${termo}`);
        const linhas = await response.json();

        if (response.ok) {
            if (linhas.length > 0) {
                msgLinha.textContent = `Encontradas ${linhas.length} linha(s). Clique para rastrear.`;
                linhas.forEach(linha => {
                    const div = document.createElement('div');
                    div.className = 'linha-item';
                    const nomeLinha = `${linha.lt}-${linha.tl} - Sentido 1: ${linha.tp} | Sentido 2: ${linha.ts}`;
                    div.innerHTML = `<strong>${linha.lt}-${linha.tl}</strong> (${linha.cl}): ${nomeLinha}`;
                    
                    // Adiciona o evento para iniciar o rastreamento
                    div.onclick = () => {
                        iniciarRastreamento(linha.cl, `${linha.lt}-${linha.tl}`);
                    };
                    resLinhas.appendChild(div);
                });
            } else {
                msgLinha.textContent = 'Nenhuma linha encontrada.';
            }
        } else {
            msgLinha.textContent = `Erro ao buscar linhas: ${linhas.error || 'Erro desconhecido'}`;
            console.error("Erro na busca de linha:", linhas);
        }
    } catch (error) {
        msgLinha.textContent = 'Erro de conexão com o servidor/proxy.';
        console.error("Erro ao chamar o proxy:", error);
    }
}

function iniciarRastreamento(codigoLinha, nomeLinha) {
    // 1. Limpa o rastreamento anterior, se houver
    if (intervalId) {
        clearInterval(intervalId);
    }
    
    codigoLinhaAtiva = codigoLinha;
    document.getElementById('linha-ativa-info').textContent = nomeLinha;
    
    // 2. Executa a primeira busca imediatamente
    buscarVeiculos();

    // 3. Configura o temporizador de atualização (a cada 10 segundos)
    // O tempo é em milissegundos: 10 * 1000 = 10000ms
    intervalId = setInterval(buscarVeiculos, 10000); 

    document.getElementById('mensagem-veiculo').textContent = `Rastreando linha ${nomeLinha} (CL: ${codigoLinha}).`;
}

async function buscarVeiculos() {
    const codigo = codigoLinhaAtiva;
    const msgVeiculo = document.getElementById('mensagem-veiculo');
    const resVeiculos = document.getElementById('resultado-veiculos');
    const ultimaAtualizacao = document.getElementById('ultima-atualizacao');

    if (!codigo) {
        msgVeiculo.textContent = 'Nenhuma linha selecionada para rastreamento.';
        return;
    }

    try {
        msgVeiculo.textContent = `Atualizando veículos para ${codigo}...`;
        
        const response = await fetch(`${PROXY_URL}/Posicao/Linha?codigoLinha=${codigo}`);
        const dados = await response.json();

        if (response.ok) {
            const veiculos = dados.vs || [];
            const hr = dados.hr || 'N/A';
            
            ultimaAtualizacao.textContent = `Última atualização: ${hr}`;
            resVeiculos.innerHTML = '';
            
            if (veiculos.length > 0) {
                msgVeiculo.textContent = `Localizados ${veiculos.length} veículo(s).`;
                
                // 1. Limpa marcadores antigos (apenas aqueles que não existem mais)
                const veiculosAtuais = veiculos.map(v => v.p);
                Object.keys(markers).forEach(prefixo => {
                    if (!veiculosAtuais.includes(parseInt(prefixo))) {
                        veiculosLayerGroup.removeLayer(markers[prefixo]);
                        delete markers[prefixo];
                    }
                });

                // 2. Adiciona/Atualiza marcadores e lista
                veiculos.forEach(v => {
                    // Informações do veículo
                    const lat = v.py;
                    const lon = v.px;
                    const acessivel = v.a ? 'Sim' : 'Não';
                    const horaUTC = v.ta.substring(11, 19);
                    const prefixo = v.p;

                    // Cria/Atualiza o marcador no mapa
                    if (markers[prefixo]) {
                        // Atualiza posição do marcador existente
                        markers[prefixo].setLatLng([lat, lon]);
                    } else {
                        // Cria novo marcador
                        const popupContent = `
                            <strong>Prefixo: ${prefixo}</strong><br>
                            Acessível: ${acessivel}<br>
                            Hora (UTC): ${horaUTC}<br>
                            Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}
                        `;
                        const marker = L.marker([lat, lon], {icon: busIcon})
                            .bindPopup(popupContent)
                            .addTo(veiculosLayerGroup);
                        markers[prefixo] = marker;
                    }

                    // Preenche a lista de veículos na sidebar
                    const div = document.createElement('div');
                    div.className = 'veiculo-info';
                    div.innerHTML = `
                        <strong>Prefixo: ${prefixo}</strong> | Acessível: ${acessivel}
                        <br>Lat/Long: ${lat.toFixed(5)}, ${lon.toFixed(5)} | Hora (UTC): ${horaUTC}
                    `;
                    resVeiculos.appendChild(div);
                });

                // 3. Ajusta o mapa para mostrar todos os veículos
                if (veiculos.length > 0) {
                    const bounds = veiculosLayerGroup.getBounds();
                    if (bounds.isValid()) {
                        mapa.fitBounds(bounds);
                    }
                }

            } else {
                msgVeiculo.textContent = `Nenhum veículo localizado.`;
                veiculosLayerGroup.clearLayers();
                markers = {};
            }
        } else {
            msgVeiculo.textContent = `Erro ao buscar veículos: ${dados.error || 'Erro desconhecido'}`;
            console.error("Erro na busca de veículos:", dados);
        }
    } catch (error) {
        msgVeiculo.textContent = 'Erro de conexão ou processamento.';
        console.error("Erro ao chamar o proxy:", error);
    }
}
