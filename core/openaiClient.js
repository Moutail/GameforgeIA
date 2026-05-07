// ============================================================
//  GAMEFORGE AI — core/openaiClient.js
//  Client OpenAI minimaliste (compatible API ChatCompletions)
//  ► Permet d'utiliser GPT-4o / o1-mini si l'utilisateur a une clé sk-…
//  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
// ============================================================

class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.url    = "https://api.openai.com/v1/chat/completions";
  }

  /**
   * Compatible avec la signature de GroqClient.chat()
   * @param {{role:string,content:string}[]} messages
   * @param {string}    model
   * @param {Function?} onStatus
   * @param {{maxTokens?:number,temperature?:number}} opts
   */
  async chat(messages, model, onStatus = null, opts = {}) {
    if (!this.apiKey) throw new Error("Clé OpenAI manquante (sk-…)");

    const maxTokens   = opts.maxTokens   ?? (window.ModelRegistry?.maxOutputFor(model) || 4000);
    const temperature = opts.temperature ?? 0.7;
    const isReasoning = /^o1|^o3/.test(model);  // les modèles "o-series" ne supportent pas certains paramètres

    const body = isReasoning
      ? { model, messages, max_completion_tokens: maxTokens }
      : { model, messages, max_tokens: maxTokens, temperature };

    if (onStatus) onStatus(`🟢 OpenAI → ${model}...`, "key");

    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Réponse OpenAI vide");

    if (onStatus) {
      const used = data.usage?.completion_tokens ?? "?";
      onStatus(`✅ OpenAI OK — ${used} tokens générés`, "success");
    }
    return text;
  }
}

window.OpenAIClient = OpenAIClient;
