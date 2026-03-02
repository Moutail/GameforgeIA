// ============================================================
//  GAMEFORGE AI — core/keyRotation.js
//  Gestion intelligente de la rotation des clés API Groq
//  Stratégie : Round-Robin avec détection des clés épuisées
// ============================================================

class KeyRotationManager {

  /**
   * @param {string[]} keys - Tableau de clés API depuis config.js
   */
  constructor(keys) {
    // Filtre les clés non remplies (placeholders)
    this.keys = keys.filter(k =>
      k && k.startsWith("gsk_") && !k.includes("INSERE")
    );

    if (this.keys.length === 0) {
      throw new Error("Aucune clé Groq valide trouvée dans config.js");
    }

    // Index courant pour le round-robin
    this.currentIndex = 0;

    // Clés temporairement bloquées { keyIndex: timestampExpiry }
    this.blocked = {};

    console.log(`[KeyRotation] ${this.keys.length} clé(s) chargée(s)`);
  }

  // ── Retourne la prochaine clé disponible ──────────────────
  getNext() {
    const now = Date.now();
    let attempts = 0;

    while (attempts < this.keys.length) {
      const index = this.currentIndex % this.keys.length;
      this.currentIndex++;

      // Si la clé est bloquée et le délai n'est pas expiré → passer
      if (this.blocked[index] && this.blocked[index] > now) {
        attempts++;
        continue;
      }

      // Clé disponible
      return {
        key:    this.keys[index],
        num:    index + 1,
        index:  index,
      };
    }

    // Toutes les clés bloquées — on attend et on retente avec la première
    throw new Error("Toutes les clés sont temporairement bloquées (rate limit)");
  }

  // ── Marque une clé comme bloquée (rate limit 429) ─────────
  blockKey(index, durationMs = 60000) {
    this.blocked[index] = Date.now() + durationMs;
    console.warn(`[KeyRotation] Clé K${index + 1} bloquée pour ${durationMs / 1000}s`);
  }

  // ── Réinitialise les blocages expirés ─────────────────────
  cleanBlocked() {
    const now = Date.now();
    for (const idx in this.blocked) {
      if (this.blocked[idx] <= now) delete this.blocked[idx];
    }
  }

  // ── Retourne le statut de toutes les clés ─────────────────
  getStatus() {
    const now = Date.now();
    return this.keys.map((_, i) => ({
      num:       i + 1,
      available: !this.blocked[i] || this.blocked[i] <= now,
      blockedMs: this.blocked[i] ? Math.max(0, this.blocked[i] - now) : 0,
    }));
  }
}
