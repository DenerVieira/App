// functions/sptrans-proxy.js

// Seu token DEVE ser armazenado como uma variável de ambiente no Netlify,
// por exemplo, com o nome SPTRANS_TOKEN.
const TOKEN = process.env.SPTRANS_TOKEN;
const BASE_URL = 'http://api.olhovivo.sptrans.com.br/api/v2';
const AUTH_URL = `${BASE_URL}/Login/Autenticar?token=${TOKEN}`;

// Variável para armazenar o cookie de sessão.
let sessionCookie = null;
let lastAuthTime = 0;

/**
 * Autentica ou renova a autenticação com a API da SPTrans.
 * A sessão expira após 15-20 minutos, então reautenticamos se necessário.
 */
const authenticate = async () => {
    // Reautentica apenas se o cookie estiver vazio ou se a última autenticação foi há mais de 10 minutos (600000 ms)
    if (!sessionCookie || (Date.now() - lastAuthTime > 600000)) {
        console.log("Tentando autenticar...");
        try {
            const response = await fetch(AUTH_URL, { method: 'POST' });

            if (response.ok) {
                // Captura o cookie de sessão
                const setCookieHeader = response.headers.get('set-cookie');
                if (setCookieHeader) {
                    // Extrai o 'apiCredentials' que é o cookie de sessão necessário
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
                return false;
            }
        } catch (error) {
            console.error("Erro na requisição de autenticação:", error);
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
            body: JSON.stringify({ error: "Falha ao autenticar com a API da SPTrans." }),
        };
    }

    // 2. Realiza a chamada real à API da SPTrans
    try {
        console.log(`Chamando: ${fullUrl}`);
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
                // Adiciona cabeçalhos de CORS para que o frontend possa acessar
                'Access-Control-Allow-Origin': '*', 
                'Content-Type': 'application/json'
            },
            body: await apiResponse.text(), // Retorna o corpo da resposta como texto
        };
    } catch (error) {
        console.error("Erro ao chamar a API da SPTrans:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Erro interno no proxy: ${error.message}` }),
        };
    }
};
