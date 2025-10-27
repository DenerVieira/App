// public/script.js

const PROXY_URL = '/api'; // Endereço para a Netlify Function
let codigoLinhaAtiva = null;
let intervalId = null; 
let mapa = null;
let veiculosLayerGroup = null; 
const markers = {}; 

// --- Inicialização do Mapa Leaflet ---
function initMap() {
    const initialCoords = [-23.5505, -46.6333]; // São Paulo
    mapa = L.map('mapa').setView(initialCoords, 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapa);

    veiculosLayerGroup = L.layerGroup().addTo(mapa);
}

// Ícone personalizado para os ônibus (SVG)
const busIcon = L.icon({
    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="%23007bff" d="M16 272c0 8.8 7.2 16 16 16H80V416H24c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h464c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16H432V288h48c8.8 0 16-7.2 16-16V224H16v48zM399.7 192l-21.7 48H134.1l-21.7-48H399.7zM480 192H32c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16h448c8.8 0 16 7.2 16 16v112c0 8.8-7.2 16-16 16zM112 112c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v16c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16v-16zM320 112c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16v16c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16v-16z"/></svg>',
    iconSize: [32, 32], 
    iconAnchor: [16, 32], 
    popupAnchor: [0, -32]
});

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
                    
                    div.onclick = () => {
                        iniciarRastreamento(linha.cl, `${linha.lt}-${linha.tl}`);
                        // Destaca a linha clicada (opcional)
                        document.querySelectorAll('.linha-item').forEach(item => item.style.backgroundColor = '#f9f9f9');
                        div.style.backgroundColor = '#dbe9ff'; 
                    };
                    resLinhas.appendChild(div);
                });
            } else {
                msgLinha.textContent = 'Nenhuma linha encontrada.';
            }
        } else {
            // Se o proxy retornar um erro (ex: 503 Falha Autenticação)
            msgLinha.textContent = `Erro ao buscar linhas: ${linhas.error || 'Erro desconhecido'}`;
        }
    } catch (error) {
        msgLinha.textContent = 'Erro de conexão com o servidor/proxy.';
        console.error("Erro ao chamar o proxy:", error);
    }
}

function iniciarRastreamento(codigoLinha, nomeLinha) {
    // 1. Limpa o rastreamento anterior
    if (intervalId) {
        clearInterval(intervalId);
    }
    
    codigoLinhaAtiva = codigoLinha;
    document.getElementById('linha-ativa-info').textContent = nomeLinha;
    
    // 2. Executa a primeira busca imediatamente
    buscarVeiculos();

    // 3. Configura o temporizador de atualização (a cada 10 segundos)
    intervalId = setInterval(buscarVeiculos, 10000); 

    document.getElementById('mensagem-veiculo').textContent = `Iniciando rastreamento da linha ${nomeLinha}...`;
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
        msgVeiculo.textContent = `Atualizando dados da linha ${codigo}...`;
        
        const response = await fetch(`${PROXY_URL}/Posicao/Linha?codigoLinha=${codigo}`);
        const dados = await response.json();

        if (response.ok) {
            const veiculos = dados.vs || [];
            const hr = dados.hr || 'N/A';
            
            ultimaAtualizacao.textContent = `Última atualização: ${new Date().toLocaleTimeString()} (Dados: ${hr})`;
            resVeiculos.innerHTML = '';
            
            // 1. Limpa marcadores de veículos que não estão mais presentes
            const veiculosAtuais = veiculos.map(v => v.p);
            Object.keys(markers).forEach(prefixo => {
                if (!veiculosAtuais.includes(parseInt(prefixo))) {
                    veiculosLayerGroup.removeLayer(markers[prefixo]);
                    delete markers[prefixo];
                }
            });

            if (veiculos.length > 0) {
                msgVeiculo.textContent = `Localizados ${veiculos.length} veículo(s) em tempo real.`;
                
                let boundsArray = [];

                // 2. Adiciona/Atualiza marcadores e lista
                veiculos.forEach(v => {
                    const lat = v.py;
                    const lon = v.px;
                    const acessivel = v.a ? 'Sim' : 'Não';
                    const horaUTC = v.ta.substring(11, 19);
                    const prefixo = v.p;

                    const popupContent = `
                        <strong>Prefixo: ${prefixo}</strong><br>
                        Acessível: ${acessivel}<br>
                        Hora (UTC): ${horaUTC}<br>
                        Lat/Lon: ${lat.toFixed(5)}, ${lon.toFixed(5)}
                    `;
                    
                    if (markers[prefixo]) {
                        markers[prefixo].setLatLng([lat, lon]).setPopupContent(popupContent);
                    } else {
                        const marker = L.marker([lat, lon], {icon: busIcon})
                            .bindPopup(popupContent)
                            .addTo(veiculosLayerGroup);
                        markers[prefixo] = marker;
                    }
                    
                    boundsArray.push([lat, lon]);

                    const div = document.createElement('div');
                    div.className = 'veiculo-info';
                    div.innerHTML = `
                        <strong>Prefixo: ${prefixo}</strong> | Acessível: ${acessivel}
                        <br>Lat/Long: ${lat.toFixed(5)}, ${lon.toFixed(5)} | Hora (UTC): ${horaUTC}
                    `;
                    resVeiculos.appendChild(div);
                });

                // 3. Ajusta o mapa para mostrar todos os veículos na primeira atualização
                if (boundsArray.length > 0) {
                     // Ajusta a visualização do mapa apenas na primeira atualização (ou se mudar muito)
                     if (veiculosLayerGroup.getLayers().length <= veiculos.length && veiculosLayerGroup.getLayers().length > 0) {
                         mapa.fitBounds(veiculosLayerGroup.getBounds(), { padding: [50, 50] });
                     }
                }

            } else {
                msgVeiculo.textContent = `Nenhum veículo localizado.`;
                veiculosLayerGroup.clearLayers();
                markers = {};
            }
        } else {
            // Trata erros de requisição retornados pelo proxy (ex: 503, 500)
            msgVeiculo.textContent = `Erro ao buscar veículos: ${dados.error || 'Falha na requisição'}`;
        }
    } catch (error) {
        // Trata erros de rede no frontend (falha de DNS, CORS, etc.)
        msgVeiculo.textContent = 'Erro FATAL de comunicação com o servidor. Tente novamente.';
        console.error("Erro ao chamar o proxy:", error);
    }
}
