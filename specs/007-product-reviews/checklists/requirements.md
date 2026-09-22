# Specification Quality Checklist: Avis et notes par produit

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Une passe de validation, une correction réelle.

**Corrigé** — FR-013 et FR-014 raisonnaient en « requêtes » et en
« chargement », c'est-à-dire en implémentation. Reformulés en résultat
observable : la note apparaît en même temps que le reste de la fiche, et
l'ouverture de la fiche ne coûte pas le temps d'aller chercher les textes.

**Vérifié, rien à corriger** — aucun nom de fichier, de colonne, de table ni de
technologie dans la spec (contrôle par recherche). Aucun seuil technique dans
les critères de succès.

**Aucun marqueur [NEEDS CLARIFICATION]** : les trois zones d'ombre réelles —
modification d'un avis par son auteur, délai limite pour noter, seuil
d'affichage de la moyenne — ont été tranchées par alignement sur les règles
déjà appliquées aux avis de boutique, et consignées dans Assumptions plutôt que
renvoyées au porteur du produit.

**Point à surveiller au plan** : FR-016 (pondération des avis récents) et FR-017
(tri par note) supposent tous deux une moyenne tenue à jour à l'écriture. Si le
plan retient un calcul à la lecture, SC-003 tombe.

**Décision structurante à ne pas relâcher** : FR-009 retire la note de la
boutique de la fiche produit. Un produit sans avis n'affichera donc plus aucune
note, là où il en montrait une auparavant. C'est assumé — la note affichée était
trompeuse — mais c'est une perte de signal visible à surveiller après mise en
production.
