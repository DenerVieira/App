// functions/sptrans-proxy.js

// SEU TOKEN DEVE SER CONFIGURADO COMO VARIÁVEL DE AMBIENTE NO NETLIFY (SPTRANS_TOKEN)
const TOKEN = process.env.SPTRANS_TOKEN;
// CORREÇÃO APLICADA AQUI: Mudança para /v2.1
const BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1'; 
const AUTH_URL = `${BASE_URL}/Login/Autenticar?token=${TOKEN}`;

// Variável para armazenar o cookie de sessão.
let sessionCookie = null;
let lastAuthTime = 0;

/**
 * Autentica ou renova a autenticação com a API da SPTrans.
 */
const authenticate = async () => {
    // Reautentica apenas se o cookie estiver vazio ou se a última autenticação foi há mais de 10 minutos
    if (!sessionCookie || (Date.now() - lastAuthTime > 600000)) {
        console.log("Tentando autenticar...");
        try {
            // A API de autenticação exige um método POST
            const response = await fetch(AUTH_URL, { method: 'POST' });

            if (response.ok) {
                // A SPTrans retorna o cookie necessário no cabeçalho 'set-cookie'
                const setCookieHeader = response.headers.get('set-cookie');
                if (setCookieHeader) {
                    // Extrai apenas o valor do cookie 'apiCredentials' (sem os atributos como Path, Expires, etc.)
                    sessionCookie = setCookieHeader.split(';')[0];
                    lastAuthTime = Date.now();
                    console.log("Autenticação bem-sucedida. Cookie capturado.");
                    return true;
                } else {
                    console.error("Autenticação bem-sucedida, mas o cookie 'set-cookie' não foi encontrado.");
                    return false;
                }
            } else {
                console.error(`Erro na autenticação: ${response.status} ${response.statusText}`);
                // Adiciona log detalhado do erro
                const errorBody = await response.text();
                console.error("Corpo da resposta de erro:", errorBody);
                return false;
            }
        } catch (error) {
            console.error("Erro na requisição de autenticação (rede/DNS):", error);
            return false;
        }
    }
    return true; // Já autenticado
};

/**
 * Função principal para o Netlify Function.
 */
exports.handler = async (event, context) => {
    if (!TOKEN) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Token SPTRANS_TOKEN não configurado no Netlify." }),
        };
    }

    // Processa o caminho da requisição do cliente
    // Ex: /api/Linha/Buscar?termosBusca=Lapa
    const path = event.path.replace('/.netlify/functions/sptrans-proxy', '').replace('/api', '');
    const queryString = event.rawQuery;
    const fullUrl = `${BASE_URL}${path}${queryString ? '?' + queryString : ''}`;

    // 1. Garante que a sessão está ativa (Autenticação)
    const isAuthenticated = await authenticate();
    if (!isAuthenticated) {
        return {
            statusCode: 503,
            body: JSON.stringify({ error: "Falha ao autenticar com a API da SPTrans. Verifique seu token e status." }),
        };
    }

    // 2. Realiza a chamada real à API da SPTrans, usando o cookie
    try {
        console.log(`Chamando endpoint da SPTrans: ${fullUrl}`);
        const apiResponse = await fetch(fullUrl, {
            method: 'GET', // Todos os métodos de dados são GET
            headers: {
                'Cookie': sessionCookie
            }
        });

        // 3. Retorna a resposta para o cliente
        return {
            statusCode: apiResponse.status,
            headers: {
                'Access-Control-Allow-Origin': '*', 
                'Content-Type': 'application/json'
            },
            body: await apiResponse.text(),
        };
    } catch (error) {
        console.error("Erro ao chamar a API da SPTrans (Proxy):", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Erro interno no proxy: ${error.message}` }),
        };
    }
};
