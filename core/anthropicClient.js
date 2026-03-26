// ============================================================
//  GAMEFORGE AI — core/anthropicClient.js
//  Client pour l'API Anthropic (Claude)
//  Interface identique à GroqClient : chat(messages, model, onStatus)
// ============================================================

class AnthropicClient {

  constructor(apiKey) {
    this.apiKey  = apiKey;
    this.apiUrl  = "https://api.anthropic.com/v1/messages";
    this.version = "2023-06-01";
  }

  /**
   * Envoie une requête à l'API Anthropic Claude.
   * Même interface que GroqClient.chat() pour compatibilité avec le pipeline.
   *
   * @param {Array}    messages  - Format OpenAI : [{role, content}]
   *                               Le rôle "system" est extrait vers le champ top-level
   * @param {string}   model     - ID du modèle Claude (ex: "claude-sonnet-4-6")
   * @param {Function} onStatus  - Callback(msg, type) pour les logs UI
   * @returns {Promise<string>}  - Contenu texte de la réponse
   */
  async chat(messages, model, onStatus = null) {
    const modelShort = model.split("-").slice(0, 3).join("-");

    if (onStatus) onStatus(`🔑 Claude → ${modelShort}...`, "key");

    // Séparer le message system des messages chat
    const systemMsg    = messages.find(m => m.role === "system");
    const chatMessages = messages.filter(m => m.role !== "system");

    const body = {
      model,
      max_tokens:  GAMEFORGE_CONFIG.PIPELINE.MAX_TOKENS,
      temperature: GAMEFORGE_CONFIG.PIPELINE.TEMPERATURE,
      messages:    chatMessages,
    };

    // Le system prompt va en champ top-level pour l'API Anthropic
    if (systemMsg) body.system = systemMsg.content;

    let response;
    try {
      response = await fetch(this.apiUrl, {
        method:  "POST",
        headers: {
          "x-api-key":                               this.apiKey,
          "anthropic-version":                       this.version,
          "content-type":                            "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      throw new Error(`Réseau inaccessible — vérifie ta connexion (${networkErr.message})`);
    }

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        errorMsg = errBody.error?.message || errorMsg;
      } catch (_) {}

      if (response.status === 401) throw new Error(`Clé Anthropic invalide : ${errorMsg}`);
      if (response.status === 429) throw new Error(`Rate limit Claude dépassé — attends 60s`);
      if (response.status === 529) throw new Error(`Serveur Anthropic surchargé — réessaie`);
      throw new Error(`Anthropic API ${response.status} : ${errorMsg}`);
    }

    const data   = await response.json();
    const tokens = data.usage?.output_tokens || "?";

    if (onStatus) onStatus(`✅ Claude OK — ${tokens} tokens`, "success");

    // Extraire le texte de la réponse
    const text = data.content?.[0]?.text;
    if (!text) throw new Error("Réponse Claude vide ou format inattendu");

    return text;
  }
}
