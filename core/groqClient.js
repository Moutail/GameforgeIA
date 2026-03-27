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

  // ── Appel principal avec retry + backoff exponentiel ──────
  /**
   * @param {Object[]} messages  - Format OpenAI [{role, content}]
   * @param {string}   model     - Identifiant modèle Groq
   * @param {Function} onStatus  - Callback de progression (optionnel)
   * @returns {Promise<string>}  - Texte de la réponse
   */
  async chat(messages, model, onStatus = null) {
    const maxAttempts = Math.max(6, this.pipeline.MAX_FIX_ATTEMPTS * this.rotation.keys.length);
    const baseDelay   = this.pipeline.RETRY_DELAY_MS  || 800;
    const maxDelay    = this.pipeline.MAX_RETRY_DELAY_MS || 8000;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      this.rotation.cleanBlocked();

      let currentKey;
      try {
        currentKey = this.rotation.getNext();
      } catch (e) {
        const waitMs = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        if (onStatus) onStatus(`⏳ Toutes les clés rate-limitées — attente ${(waitMs/1000).toFixed(1)}s...`, "warn");
        await sleep(waitMs);
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
          // Lit le Retry-After si présent
          const retryAfter = parseInt(response.headers.get("retry-after") || "60", 10);
          const blockMs    = retryAfter * 1000;
          this.rotation.blockKey(currentKey.index, blockMs);
          const waitMs = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
          if (onStatus) onStatus(`⚠️ Rate limit K${currentKey.num} (retry-after: ${retryAfter}s) — rotation +${(waitMs/1000).toFixed(1)}s`, "warn");
          await sleep(waitMs);
          continue;
        }

        if (response.status === 401) {
          throw new Error(`Clé K${currentKey.num} invalide ou expirée (401)`);
        }

        if (response.status === 400) {
          const errBody = await response.json().catch(() => ({}));
          const msg = errBody.error?.message || "Requête invalide (400)";
          throw new Error(msg); // Permanent : modèle décommissionné, paramètre invalide, etc.
        }

        if (response.status === 503 || response.status === 502) {
          const waitMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          if (onStatus) onStatus(`⚠️ Groq surchargé (${response.status}) — retry dans ${(waitMs/1000).toFixed(1)}s...`, "warn");
          await sleep(waitMs);
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
          const toks = usage?.completion_tokens ?? "?";
          const total = usage?.total_tokens ?? "?";
          onStatus(`✅ K${currentKey.num} OK — ${toks} tokens générés (${total} total)`, "success");
        }

        return text;

      } catch (err) {
        // Erreurs permanentes → throw immédiat, pas de retry
        const isPermanent =
          err.message.includes("invalide") ||
          err.message.includes("decommissioned") ||
          err.message.includes("no longer supported") ||
          err.message.includes("does not exist") ||
          err.message.includes("401");
        if (isPermanent) throw err;

        const waitMs = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        if (onStatus) onStatus(`❌ K${currentKey.num}: ${err.message}`, "error");
        await sleep(waitMs);
      }
    }

    throw new Error(`Échec après ${maxAttempts} tentatives sur toutes les clés`);
  }
}

// ── Utilitaire ────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
