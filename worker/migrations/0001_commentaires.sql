-- Commentaires laissés sur les outils de la page outils.html
CREATE TABLE commentaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outil_id TEXT NOT NULL,
  texte TEXT NOT NULL CHECK (length(texte) BETWEEN 1 AND 1000),
  auteur TEXT NOT NULL CHECK (length(auteur) BETWEEN 1 AND 60),
  cree_le INTEGER NOT NULL -- horodatage en millisecondes (UTC)
);

CREATE INDEX idx_commentaires_outil_cree_le ON commentaires (outil_id, cree_le);
