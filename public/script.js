// public/script.js

// O caminho para o Netlify Function (Proxy)
const PROXY_URL = '/api'; // Será resolvido para /.netlify/functions/sptrans-proxy

// Função para buscar linhas
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
        // Chamada para o Netlify Function que por sua vez chama a API da SPTrans
        const response = await fetch(`${PROXY_URL}/Linha/Buscar?termosBusca=${termo}`);
        const linhas = await response.json();

        if (response.ok) {
            if (linhas.length > 0) {
                msgLinha.textContent = `Encontradas ${linhas.length} linha(s). Clique para ver os veículos.`;
                linhas.forEach(linha => {
                    const div = document.createElement('div');
                    div.className = 'linha-item';
                    // Monta o nome completo da linha
                    const nomeLinha = `${linha.lt}-${linha.tl} - Sentido 1: ${linha.tp} | Sentido 2: ${linha.ts}`;
                    div.innerHTML = `**${linha.lt}-${linha.tl}** (${linha.cl}): ${nomeLinha}`;
                    // Adiciona um evento para carregar a posição dos veículos
                    div.onclick = () => {
                        document.getElementById('codigoLinha').value = linha.cl;
                        buscarVeiculos();
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
        msgLinha.textContent = 'Erro de conexão com o servidor.';
        console.error("Erro ao chamar o proxy:", error);
    }
}

// Função para buscar a posição dos veículos de uma linha
async function buscarVeiculos() {
    const codigoLinha = document.getElementById('codigoLinha').value;
    const msgVeiculo = document.getElementById('mensagem-veiculo');
    const resVeiculos = document.getElementById('resultado-veiculos');

    msgVeiculo.textContent = 'Buscando veículos...';
    resVeiculos.innerHTML = '';

    if (!codigoLinha) {
        msgVeiculo.textContent = 'Por favor, insira o Código da Linha (CL).';
        return;
    }

    try {
        // Chamada para o Netlify Function que por sua vez chama a API da SPTrans
        const response = await fetch(`${PROXY_URL}/Posicao/Linha?codigoLinha=${codigoLinha}`);
        const dados = await response.json();

        if (response.ok) {
            const veiculos = dados.vs || [];
            const hr = dados.hr || 'N/A';
            
            if (veiculos.length > 0) {
                msgVeiculo.textContent = `Localizados ${veiculos.length} veículo(s) para a linha ${codigoLinha}. (Atualização: ${hr})`;
                veiculos.forEach(v => {
                    const div = document.createElement('div');
                    div.className = 'veiculo-item';
                    div.innerHTML = `Prefixo **${v.p}** | Acessível: ${v.a ? 'Sim' : 'Não'} | Lat/Long: ${v.py}, ${v.px} | Horário: ${v.ta.substring(11, 19)}`;
                    resVeiculos.appendChild(div);
                });
            } else {
                msgVeiculo.textContent = `Nenhum veículo localizado para a linha ${codigoLinha}. (Atualização: ${hr})`;
            }
        } else {
            msgVeiculo.textContent = `Erro ao buscar veículos: ${dados.error || 'Erro desconhecido'}`;
            console.error("Erro na busca de veículos:", dados);
        }
    } catch (error) {
        msgVeiculo.textContent = 'Erro de conexão com o servidor.';
        console.error("Erro ao chamar o proxy:", error);
    }
}
