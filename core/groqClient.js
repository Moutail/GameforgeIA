// ============================================================
//  GAMEFORGE AI — core/groqClient.js
//  Client HTTP pour l'API Groq
//  Dépend de : config.js, core/keyRotation.js
// ============================================================

class GroqClient {

  /**
   * @param {KeyRotationManager} rotationManager
   */
  constructor(rotationManager) {
    this.rotation = rotationManager;
    this.apiUrl   = GAMEFORGE_CONFIG.GROQ_API_URL;
    this.pipeline = GAMEFORGE_CONFIG.PIPELINE;
  }

  // ── Appel principal avec retry automatique ────────────────
  /**
   * @param {Object[]} messages  - Format OpenAI [{role, content}]
   * @param {string}   model     - Identifiant modèle Groq
   * @param {Function} onStatus  - Callback de progression (optionnel)
   * @returns {Promise<string>}  - Texte de la réponse
   */
  async chat(messages, model, onStatus = null) {
    const maxAttempts = this.pipeline.MAX_FIX_ATTEMPTS * this.rotation.keys.length;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      this.rotation.cleanBlocked();

      let currentKey;
      try {
        currentKey = this.rotation.getNext();
      } catch (e) {
        // Toutes les clés bloquées — attendre
        if (onStatus) onStatus(`⏳ Toutes les clés rate-limitées, attente...`, "warn");
        await sleep(this.pipeline.RETRY_DELAY_MS * 3);
        continue;
      }

      if (onStatus) {
        onStatus(`🔑 K${currentKey.num} → ${model.split("-").slice(0,3).join("-")}...`, "key");
      }

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${currentKey.key}`,
          },
          body: JSON.stringify({
            model:       model,
            messages:    messages,
            max_tokens:  this.pipeline.MAX_TOKENS,
            temperature: this.pipeline.TEMPERATURE,
          }),
        });

        // ── Gestion des codes HTTP ──────────────────────────
        if (response.status === 429) {
          this.rotation.blockKey(currentKey.index, 60000);
          if (onStatus) onStatus(`⚠️ Rate limit K${currentKey.num} — rotation`, "warn");
          await sleep(this.pipeline.RETRY_DELAY_MS);
          continue;
        }

        if (response.status === 401) {
          throw new Error(`Clé K${currentKey.num} invalide ou expirée (401)`);
        }

        if (response.status === 503) {
          if (onStatus) onStatus(`⚠️ Groq surchargé (503) — retry...`, "warn");
          await sleep(2000);
          continue;
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error?.message || `HTTP ${response.status}`);
        }

        const data  = await response.json();
        const text  = data.choices?.[0]?.message?.content;
        const usage = data.usage;

        if (!text) throw new Error("Réponse Groq vide");

        if (onStatus) {
          onStatus(`✅ K${currentKey.num} OK — ${usage?.completion_tokens ?? "?"} tokens`, "success");
        }

        return text;

      } catch (err) {
        // Erreur réseau ou clé invalide
        if (err.message.includes("invalide")) throw err;
        if (onStatus) onStatus(`❌ K${currentKey.num}: ${err.message}`, "error");
        await sleep(this.pipeline.RETRY_DELAY_MS);
      }
    }

    throw new Error(`Échec après ${maxAttempts} tentatives sur toutes les clés`);
  }
}

// ── Utilitaire ────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
