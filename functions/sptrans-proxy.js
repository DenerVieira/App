// functions/sptrans-proxy.js

// Lembre-se: O TOKEN DEVE ser configurado como variável de ambiente no NETLIFY (SPTRANS_TOKEN)
const TOKEN = process.env.SPTRANS_TOKEN;
const BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1'; 
const AUTH_URL = `${BASE_URL}/Login/Autenticar?token=${TOKEN}`;

let sessionCookie = null;
let lastAuthTime = 0;

/**
 * Autentica ou renova a autenticação com a API da SPTrans.
 */
const authenticate = async () => {
    // Reautentica se o cookie estiver vazio ou se a última autenticação foi há mais de 10 minutos (600000 ms)
    // O cookie SPTrans dura 15-20 min, este é um buffer seguro.
    if (!sessionCookie || (Date.now() - lastAuthTime > 600000)) {
        console.log("Tentando autenticar ou reautenticar...");
        try {
            const response = await fetch(AUTH_URL, { method: 'POST' });

            if (response.ok) {
                const setCookieHeader = response.headers.get('set-cookie');
                
                if (setCookieHeader) {
                    // Usa regex para garantir a captura correta do cookie 'apiCredentials'
                    const match = setCookieHeader.match(/apiCredentials=[^;]+/);
                    
                    if (match) {
                        sessionCookie = match[0]; // Ex: "apiCredentials=..."
                        lastAuthTime = Date.now();
                        console.log("Autenticação bem-sucedida. Cookie capturado.");
                        return true;
                    } else {
                        console.error("Autenticação bem-sucedida, mas o cookie 'apiCredentials' não foi encontrado.");
                        return false;
                    }
                } else {
                    console.error("Autenticação bem-sucedida, mas o cabeçalho 'set-cookie' não foi encontrado.");
                    return false;
                }
            } else {
                console.error(`Erro na autenticação: ${response.status} ${response.statusText}`);
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

    const path = event.path.replace('/.netlify/functions/sptrans-proxy', '').replace('/api', '');
    const queryString = event.rawQuery;
    const fullUrl = `${BASE_URL}${path}${queryString ? '?' + queryString : ''}`;

    // 1. Garante que a sessão está ativa
    const isAuthenticated = await authenticate();
    if (!isAuthenticated) {
        return {
            statusCode: 503,
            body: JSON.stringify({ error: "Falha ao autenticar com a API da SPTrans. Sessão expirada ou token inválido." }),
        };
    }

    // 2. Realiza a chamada real à API da SPTrans
    try {
        console.log(`Proxy: Encaminhando requisição para ${path}`); // Log de confirmação
        const apiResponse = await fetch(fullUrl, {
            method: 'GET',
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
        // Captura erros de rede/timeout entre o Netlify e a SPTrans
        console.error("Erro FATAL ao chamar a API da SPTrans (Proxy Timeout):", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Falha na comunicação de rede com a API da SPTrans (Proxy Timeout)." }),
        };
    }
};
