// Commentaires des outils : un bloc repliable par outil, chargé à la première ouverture.
(() => {
  const api = document.querySelector('meta[name="api-commentaires"]')?.content;
  if (!api) return;
  const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

  for (const outil of document.querySelectorAll("[data-outil]")) {
    const id = outil.dataset.outil;
    const nom = outil.querySelector("h3").firstChild.textContent.trim();
    const url = `${api}/api/outils/${id}/commentaires`;

    const bloc = document.createElement("details");
    bloc.className = "commentaires";
    bloc.innerHTML = `
      <summary>Commentaires<span class="visually-hidden"></span></summary>
      <p class="statut" role="status"></p>
      <ol class="liste"></ol>
      <button type="button" class="plus" hidden>Afficher des commentaires plus anciens</button>
      <form>
        <p><label for="c-${id}-auteur">Votre nom (facultatif)</label>
          <input id="c-${id}-auteur" name="auteur" maxlength="60" autocomplete="nickname"></p>
        <p><label for="c-${id}-texte">Votre commentaire</label>
          <textarea id="c-${id}-texte" name="texte" rows="3" maxlength="1000" required aria-describedby="c-${id}-aide"></textarea></p>
        <p id="c-${id}-aide" class="muted">1000 caractères maximum. Les commentaires sont publics et conservés 12 mois.</p>
        <button type="submit">Publier</button>
      </form>`;
    bloc.querySelector(".visually-hidden").textContent = ` sur ${nom}`;
    outil.append(bloc);

    const statut = bloc.querySelector(".statut");
    const liste = bloc.querySelector(".liste");
    const plus = bloc.querySelector(".plus");
    const form = bloc.querySelector("form");
    let suivant = null;

    const element = (c) => {
      const li = document.createElement("li");
      const meta = document.createElement("p");
      const auteur = document.createElement("strong");
      const date = document.createElement("time");
      const texte = document.createElement("p");
      auteur.textContent = c.auteur;
      date.dateTime = c.cree_le;
      date.textContent = dateFr.format(new Date(c.cree_le));
      texte.textContent = c.texte;
      meta.append(auteur, ", le ", date);
      li.append(meta, texte);
      return li;
    };

    const charger = async () => {
      statut.textContent = "Chargement des commentaires…";
      try {
        const rep = await fetch(suivant ? `${url}?avant=${suivant}` : url);
        if (!rep.ok) throw new Error();
        const donnees = await rep.json();
        liste.append(...donnees.commentaires.map(element));
        suivant = donnees.suivant;
        plus.hidden = !suivant;
        statut.textContent = liste.children.length ? "" : "Aucun commentaire pour l'instant.";
      } catch {
        statut.textContent = "Impossible de charger les commentaires. Réessayez plus tard.";
      }
    };

    bloc.addEventListener("toggle", () => { if (bloc.open && !bloc.dataset.charge) { bloc.dataset.charge = "1"; charger(); } });
    plus.addEventListener("click", charger);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const bouton = form.querySelector("button");
      bouton.disabled = true;
      statut.textContent = "Publication en cours…";
      try {
        const rep = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte: form.texte.value, auteur: form.auteur.value }),
        });
        const donnees = await rep.json().catch(() => ({}));
        if (!rep.ok) throw { erreurApi: donnees.erreur };
        liste.prepend(element(donnees));
        form.texte.value = "";
        statut.textContent = "Commentaire publié.";
      } catch (err) {
        statut.textContent = err.erreurApi || "La publication a échoué. Réessayez plus tard.";
      } finally {
        bouton.disabled = false;
      }
    });
  }
})();
