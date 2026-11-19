// API des commentaires des outils (Cloudflare Worker + D1).
//   GET  /api/outils/{outilId}/commentaires[?avant=curseur]  20 derniers, paginés
//   POST /api/outils/{outilId}/commentaires                  { "texte": "...", "auteur": "..." }
// Toutes les requêtes SQL passent par prepare().bind().

const PAR_PAGE = 20;
const ROUTE = /^\/api\/outils\/([a-z0-9-]{1,64})\/commentaires$/;
const CURSEUR = /^(\d{1,15})_(\d{1,15})$/;
const TAILLE_MAX_CORPS = 4096;
const TEXTE_MAX = 1000;
const AUTEUR_MAX = 60;

export default {
  async fetch(request, env) {
    const origine = request.headers.get("Origin");
    const cors = enTetesCors(origine, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const route = new URL(request.url).pathname.match(ROUTE);
    if (!route) return json({ erreur: "Adresse inconnue." }, 404, cors);
    const outilId = route[1];

    try {
      if (request.method === "GET") return await lister(request, env, outilId, cors);
      if (request.method === "POST") {
        // Le formulaire n'est proposé que sur les pages du site.
        if (!origineAutorisee(origine, env)) return json({ erreur: "Origine non autorisée." }, 403, cors);
        return await ajouter(request, env, outilId, cors);
      }
    } catch (e) {
      console.error(e);
      return json({ erreur: "Erreur du serveur." }, 500, cors);
    }
    return json({ erreur: "Méthode non autorisée." }, 405, { ...cors, Allow: "GET, POST, OPTIONS" });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(purger(env, controller.scheduledTime));
  },
};

async function lister(request, env, outilId, cors) {
  const avant = new URL(request.url).searchParams.get("avant");
  let requete;
  if (avant === null) {
    requete = env.DB.prepare(
      "SELECT id, texte, auteur, cree_le FROM commentaires WHERE outil_id = ?1 ORDER BY cree_le DESC, id DESC LIMIT ?2"
    ).bind(outilId, PAR_PAGE + 1);
  } else {
    const c = avant.match(CURSEUR);
    if (!c) return json({ erreur: "Curseur de pagination invalide." }, 400, cors);
    requete = env.DB.prepare(
      "SELECT id, texte, auteur, cree_le FROM commentaires WHERE outil_id = ?1 AND (cree_le < ?2 OR (cree_le = ?2 AND id < ?3)) ORDER BY cree_le DESC, id DESC LIMIT ?4"
    ).bind(outilId, Number(c[1]), Number(c[2]), PAR_PAGE + 1);
  }

  const { results } = await requete.all();
  const page = results.slice(0, PAR_PAGE);
  const dernier = page[page.length - 1];
  return json(
    {
      commentaires: page.map(formater),
      suivant: results.length > PAR_PAGE ? `${dernier.cree_le}_${dernier.id}` : null,
    },
    200,
    { ...cors, "Cache-Control": "public, max-age=30" }
  );
}

async function ajouter(request, env, outilId, cors) {
  if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
    return json({ erreur: "Le contenu doit être en JSON." }, 415, cors);
  }
  const corps = await request.text();
  if (corps.length > TAILLE_MAX_CORPS) return json({ erreur: "Message trop long." }, 413, cors);

  let donnees;
  try {
    donnees = JSON.parse(corps);
  } catch {
    return json({ erreur: "JSON invalide." }, 400, cors);
  }
  const texte = typeof donnees?.texte === "string" ? donnees.texte.trim() : "";
  const auteur = (typeof donnees?.auteur === "string" ? donnees.auteur.trim() : "") || "Anonyme";
  if (!texte) return json({ erreur: "Le commentaire est vide." }, 400, cors);
  if (texte.length > TEXTE_MAX) return json({ erreur: `Le commentaire dépasse ${TEXTE_MAX} caractères.` }, 400, cors);
  if (auteur.length > AUTEUR_MAX) return json({ erreur: `Le nom dépasse ${AUTEUR_MAX} caractères.` }, 400, cors);

  const creeLe = Date.now();
  const ligne = await env.DB.prepare(
    "INSERT INTO commentaires (outil_id, texte, auteur, cree_le) VALUES (?1, ?2, ?3, ?4) RETURNING id, texte, auteur, cree_le"
  )
    .bind(outilId, texte, auteur, creeLe)
    .first();
  return json(formater(ligne), 201, cors);
}

async function purger(env, maintenant) {
  const limite = new Date(maintenant);
  limite.setUTCMonth(limite.getUTCMonth() - Number(env.DUREE_CONSERVATION_MOIS || 12));
  const { meta } = await env.DB.prepare("DELETE FROM commentaires WHERE cree_le < ?1")
    .bind(limite.getTime())
    .run();
  console.log(`Purge : ${meta.changes} commentaire(s) antérieur(s) au ${limite.toISOString()} supprimé(s).`);
}

function formater(l) {
  return { id: l.id, texte: l.texte, auteur: l.auteur, cree_le: new Date(l.cree_le).toISOString() };
}

function origineAutorisee(origine, env) {
  return !!origine && (env.ORIGINES_AUTORISEES || "").split(",").includes(origine);
}

function enTetesCors(origine, env) {
  if (!origineAutorisee(origine, env)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origine,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(donnees, statut, enTetes = {}) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8", ...enTetes },
  });
}
