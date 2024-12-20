const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function callOpenAI(messages) {
    const payload = {
        model: 'gpt-4o',
        messages: messages,
    };

    const response = await fetch(`${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.AZURE_OPENAI_API_KEY,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Error from OpenAI API:', errorText);
        throw new Error(`OpenAI request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
}

module.exports = {
    callOpenAI
};
