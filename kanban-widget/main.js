// Variables globales
let options = null;
let COLONNES_AFFICHAGE = [];
let COLONNES_MAP = {};
let PERSONNES = [];
let REF_PROJET = [];
let TYPES = [];
let ROTATE_CARTE = true;
let CARTE_COMPACT = false;
let READ_ONLY = false;

// Configuration initiale de Grist
grist.ready({
  requiredAccess: 'full',
  columns: [
    { name: 'TYPE', title: 'Type de tâche', type: 'Any', optional: true },
    { name: 'DESCRIPTION', title: 'Description tâche', type: 'Any' },
    { name: 'DEADLINE', title: 'Date cible', type: 'Date' },
    { name: 'STATUT', title: 'Statut tâche', type: 'Any' },
    { name: 'REFERENCE_PROJET', title: 'Référence associée', type: 'Any' },
    { name: 'NOTES', title: 'Notes complémentaires', type: 'Any', optional: true },
    { name: 'RESPONSABLE', title: 'Tâche assignée à', type: 'Any', optional: true },
    { name: 'CREE_PAR', title: 'Tâche créée par', type: 'Any', optional: true },
    { name: 'CREE_LE', title: 'Tâche créée le', type: 'DateTime', optional: true },
    { name: 'DERNIERE_MISE_A_JOUR', title: 'Mis à jour le', type: 'DateTime', optional: true },
    { name: 'COULEUR', title: 'Couleur carte', type: 'Any', optional: true }
  ],
  onEditOptions() {
    ShowConfig(true);
  }
});

// Chargement des options du widget
grist.onOptions(async function(customOptions) {
  if (!customOptions) {
    console.error("Aucune option n'a été reçue.");
    return;
  }

  options = customOptions;

  // Charger les colonnes du Kanban
  try {
    COLONNES_AFFICHAGE = JSON.parse(options.columns || "[{\"id\": \"🖐️ À faire\", \"libelle\": \"À faire\", \"couleur\": \"#f95c5e\", \"btajout\": true, \"isdone\": false, \"useconfetti\": false}, {\"id\": \"♻️ En cours\", \"libelle\": \"En cours\", \"couleur\": \"#417DC4\", \"btajout\": false, \"isdone\": false, \"useconfetti\": false}, {\"id\": \"✅ Fait\", \"libelle\": \"Fait\", \"couleur\": \"#27a658\", \"btajout\": false, \"isdone\": true, \"useconfetti\": true}, {\"id\": \"❌ Annulé\", \"libelle\": \"Annulé\", \"couleur\": \"#301717\", \"btajout\": false, \"isdone\": true, \"useconfetti\": false}]");
  } catch (e) {
    console.error("Erreur lors du chargement des colonnes :", e);
    COLONNES_AFFICHAGE = [
      { id: '🖐️ À faire', libelle: 'À faire', couleur: '#f95c5e', btajout: true, isdone: false, useconfetti: false },
      { id: '♻️ En cours', libelle: 'En cours', couleur: '#417DC4', btajout: false, isdone: false, useconfetti: false },
      { id: '✅ Fait', libelle: 'Fait', couleur: '#27a658', btajout: false, isdone: true, useconfetti: true },
      { id: '❌ Annulé', libelle: 'Annulé', couleur: '#301717', btajout: false, isdone: true, useconfetti: false }
    ];
  }

  // Charger les autres options
  ROTATE_CARTE = options.rotateCard !== undefined ? options.rotateCard : true;
  CARTE_COMPACT = options.compactCard !== undefined ? options.compactCard : false;
  READ_ONLY = options.readOnly !== undefined ? options.readOnly : false;

  // Mettre à jour l'interface utilisateur
  const cartes = document.querySelectorAll('.carte');
  if (ROTATE_CARTE) {
    cartes.forEach(carte => carte.classList.remove('norotate'));
  } else {
    cartes.forEach(carte => carte.classList.add('norotate'));
  }

  if (CARTE_COMPACT) {
    cartes.forEach(carte => carte.classList.add('compact'));
    document.querySelectorAll('.bouton-ajouter-entete').forEach(carte => carte.classList.add('compact'));
    document.querySelectorAll('.bouton-ajouter').forEach(carte => carte.classList.add('compact'));
  } else {
    cartes.forEach(carte => carte.classList.remove('compact'));
    document.querySelectorAll('.bouton-ajouter-entete').forEach(carte => carte.classList.remove('compact'));
    document.querySelectorAll('.bouton-ajouter').forEach(carte => carte.classList.remove('compact'));
  }

  ShowConfig(false);
});

// Écoute des modifications de données
grist.onRecords((records, mappings) => {
  console.log("Tâches reçues:", records);
  COLONNES_MAP = mappings;
  afficherKanban(records);
});

// Fonction pour afficher le Kanban
function afficherKanban(todos) {
  const conteneurKanban = document.getElementById('conteneur-kanban');
  conteneurKanban.innerHTML = '';

  // Création des colonnes
  COLONNES_AFFICHAGE.forEach(colonneConfig => {
    const colonne = creerColonneKanban(colonneConfig);
    conteneurKanban.appendChild(colonne);
  });

  // Distribution des tâches dans les colonnes
  if (todos?.length > 0) {
    todos.forEach(todo => {
      const carte = creerCarteTodo(todo);
      const conteneurCartes = document.querySelector(`.contenu-colonne[data-statut="${todo[COLONNES_MAP.STATUT]}"]`);
      if (conteneurCartes) {
        conteneurCartes.insertBefore(carte, conteneurCartes.firstChild);
      }
    });

    // Configuration du drag & drop et mise à jour des compteurs
    if (!READ_ONLY) {
      document.querySelectorAll('.contenu-colonne').forEach(colonne => {
        new Sortable(colonne, {
          group: 'kanban-todo',
          animation: 150,
          onEnd: async function(evt) {
            const colonneArrivee = evt.to.dataset.statut;
            if (colonneArrivee === evt.from.dataset.statut) {
              // Tri des cartes dans la même colonne
              trierTodo(colonne);
            } else {
              try {
                await mettreAJourChamp(evt.item.dataset.todoId, COLONNES_MAP.STATUT, colonneArrivee);
              } catch (erreur) {
                console.error('Erreur mise à jour statut:', erreur);
              }
            }
            trierTodo(colonne);
          }
        });
        trierTodo(colonne);
      });
    }

    // Mise à jour des compteurs
    document.querySelectorAll('.colonne-kanban').forEach(mettreAJourCompteur);
  }
}

// Fonction pour afficher ou masquer la configuration
function ShowConfig(show) {
  const popup = document.getElementById('popup-todo');
  const kanban = document.getElementById('conteneur-kanban');
  const config = document.getElementById('config-kanban');

  if (show) {
    popup.classList.remove('visible');
    kanban.classList.remove('visible');
    config.classList.add('visible');

    document.getElementById('liste-colonnes').value = JSON.stringify(COLONNES_AFFICHAGE, null, 2);
    document.getElementById('card-rotation').checked = ROTATE_CARTE;
    document.getElementById('card-compact').checked = CARTE_COMPACT;
    document.getElementById('is-readonly').checked = READ_ONLY;

    setTimeout(() => {
      const textareas = document.querySelectorAll('.auto-expand');
      textareas.forEach(textarea => {
        textarea.style.height = '';
        textarea.style.height = textarea.scrollHeight + 'px';
      });
    }, 0);
  } else {
    popup.classList.remove('visible');
    kanban.classList.add('visible');
    config.classList.remove('visible');
  }
}

// Fonction pour sauvegarder les options
async function saveOption() {
  try {
    const colonnes = document.getElementById("liste-colonnes").value;
    if (!colonnes || colonnes.trim().length === 0) {
      COLONNES_AFFICHAGE = [
        { id: '🖐️ À faire', libelle: 'À faire', couleur: '#f95c5e', btajout: true, isdone: false, useconfetti: false },
        { id: '♻️ En cours', libelle: 'En cours', couleur: '#417DC4', btajout: false, isdone: false, useconfetti: false },
        { id: '✅ Fait', libelle: 'Fait', couleur: '#27a658', btajout: false, isdone: true, useconfetti: true },
        { id: '❌ Annulé', libelle: 'Annulé', couleur: '#301717', btajout: false, isdone: true, useconfetti: false }
      ];
    } else {
      COLONNES_AFFICHAGE = JSON.parse(colonnes);
    }

    grist.widgetApi.setOption('columns', JSON.stringify(COLONNES_AFFICHAGE));

    ROTATE_CARTE = document.getElementById('card-rotation').checked;
    grist.widgetApi.setOption('rotateCard', ROTATE_CARTE);

    CARTE_COMPACT = document.getElementById('card-compact').checked;
    grist.widgetApi.setOption('compactCard', CARTE_COMPACT);

    READ_ONLY = document.getElementById('is-readonly').checked;
    grist.widgetApi.setOption('readOnly', READ_ONLY);
  } catch (erreur) {
    console.error('Erreur sauvegarde des options:', erreur);
  }
}

// Fonction pour fermer la configuration
function closeConfig() {
  ShowConfig(false);
}

// Fonction pour créer une carte TODO
function creerCarteTodo(todo) {
  const carte = document.createElement('div');
  carte.className = `carte ${ROTATE_CARTE ? '' : 'norotate'}${CARTE_COMPACT ? ' compact' : ''}`;

  carte.setAttribute('data-todo-id', todo.id);
  carte.setAttribute('data-last-update', todo[COLONNES_MAP.DERNIERE_MISE_A_JOUR] || '');
  carte.setAttribute('data-deadline', todo[COLONNES_MAP.DEADLINE] || '');

  if (COLONNES_MAP.COULEUR && todo[COLONNES_MAP.COULEUR]) {
    carte.setAttribute('style', `background-color: ${(todo[COLONNES_MAP.COULEUR].startsWith("#") ? '' : '#') + todo[COLONNES_MAP.COULEUR]}`);
  }

  const type = todo[COLONNES_MAP.TYPE] || '';
  const description = todo[COLONNES_MAP.DESCRIPTION] || 'Sans titre';
  const deadline = todo[COLONNES_MAP.DEADLINE] ? formatDate(todo[COLONNES_MAP.DEADLINE]) : '';
  const responsable = todo[COLONNES_MAP.RESPONSABLE] || '';
  const projetRef = todo[COLONNES_MAP.REFERENCE_PROJET];
  const infoColonne = COLONNES_AFFICHAGE.find((colonne) => colonne.id === todo[COLONNES_MAP.STATUT]);

  carte.innerHTML = `
    ${projetRef && projetRef.length > 0 ? `<div class="projet-ref truncate">#${projetRef}</div>` : ''}
    ${type ? `<div class="type-tag truncate">${type}</div>` : (projetRef && projetRef.length > 0 ? '<div>&nbsp;</div>' : '')}
    <div class="description">${description}</div>
    ${deadline ? `<div class="deadline${todo[COLONNES_MAP.DEADLINE] < Date.now() ? ' late' : ''} truncate">📅 ${deadline}</div>` : (responsable ? '<div>&nbsp;</div>' : '')}
    ${responsable ? `<div class="responsable-badge truncate">${responsable}</div>` : ''}
    ${infoColonne?.isdone ? `<div class="tampon-termine" style="color: ${infoColonne?.couleur};">${todo[COLONNES_MAP.STATUT]}</div>` : ''}
  `;

  carte.addEventListener('click', () => togglePopupTodo(todo));
  return carte;
}

// Fonction pour créer une colonne
function creerColonneKanban(colonne) {
  const colonneElement = document.createElement('div');
  colonneElement.className = `colonne-kanban ${colonne.btajout ? '' : 'colonne-nobouton'}`;

  const savedState = localStorage.getItem(`column-todo-${colonne.libelle}`);
  if (savedState === 'true') {
    colonneElement.classList.add('collapsed');
  }

  colonneElement.innerHTML = `
    <div class="entete-colonne" style="background-color: ${colonne.couleur}">
      <div class="titre-statut">${colonne.libelle} <span class="compteur-colonne">(0)</span></div>
      ${(colonne.btajout && !READ_ONLY) ? `
        <button class="bouton-ajouter-entete ${CARTE_COMPACT ? 'compact' : ''}" onclick="creerNouvelleTache('${colonne.id}')">+</button>
      ` : ''}
      <button class="bouton-toggle" onclick="toggleColonne(this.closest('.colonne-kanban'), event)">⇄</button>
    </div>
    ${(colonne.btajout && !READ_ONLY) ? `
      <button class="bouton-ajouter ${CARTE_COMPACT ? 'compact' : ''}" onclick="creerNouvelleTache('${colonne.id}')">+ Ajouter une tâche</button>
    ` : ''}
    <div class="contenu-colonne" data-statut="${colonne.id}"></div>
  `;

  return colonneElement;
}

// Fonction pour mettre à jour les compteurs
function mettreAJourCompteur(colonne) {
  const contenu = colonne.querySelector('.contenu-colonne');
  const compteur = colonne.querySelector('.compteur-colonne');
  if (contenu && compteur) {
    compteur.textContent = `(${contenu.children.length})`;
  }
}

// Fonction pour trier les cartes
function trierTodo(conteneur) {
  const cartes = Array.from(conteneur.children);
  const colonne = conteneur.dataset.isdone;

  cartes.sort((a, b) => {
    if (colonne) {
      const dateA = a.getAttribute('data-last-update') || '1970-01-01';
      const dateB = b.getAttribute('data-last-update') || '1970-01-01';
      const delta = new Date(dateB) - new Date(dateA);
      if (delta === 0) {
        const idA = parseInt(a.getAttribute('data-todo-id')) || 0;
        const idB = parseInt(b.getAttribute('data-todo-id')) || 0;
        return idB - idA;
      } else {
        return delta;
      }
    } else {
      const dateA = a.getAttribute('data-deadline') || '9999-12-31';
      const dateB = b.getAttribute('data-deadline') || '9999-12-31';
      const delta = new Date(dateA) - new Date(dateB);
      if (delta === 0) {
        const idA = parseInt(a.getAttribute('data-todo-id')) || 0;
        const idB = parseInt(b.getAttribute('data-todo-id')) || 0;
        return idB - idA;
      } else {
        return delta;
      }
    }
  });

  cartes.forEach(carte => conteneur.appendChild(carte));
}

// Fonction pour gérer le repli/dépli des colonnes
function toggleColonne(colonne, e) {
  e?.stopPropagation();
  colonne.classList.toggle('collapsed');
  localStorage.setItem(`column-todo-${colonne.querySelector('.titre-statut').textContent.trim()}`, colonne.classList.contains('collapsed'));
}

// Fonction pour déclencher l'animation de confettis
function triggerConfetti() {
  const duration = 3 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    confetti(Object.assign({}, defaults, {
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
    }));
    confetti(Object.assign({}, defaults, {
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
    }));
  }, 250);
}

// Fonction pour mettre à jour un champ dans Grist
async function mettreAJourChamp(todoId, champ, valeur, e) {
  try {
    e?.stopPropagation();
    const infoColonne = COLONNES_AFFICHAGE.find((colonne) => colonne.id === valeur);
    if (infoColonne && infoColonne.useconfetti && champ === COLONNES_MAP.STATUT) {
      triggerConfetti();
    }
    let data = { [champ]: valeur };
    if (COLONNES_MAP.DERNIERE_MISE_A_JOUR) {
      data[COLONNES_MAP.DERNIERE_MISE_A_JOUR] = new Date().toISOString();
    }
    await TABLE_KANBAN.update({ id: parseInt(todoId), fields: data });
  } catch (erreur) {
    console.error('Erreur mise à jour:', erreur);
  }
}

// Fonction pour formater les dates
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (date >= DEADLINE_PRIORITE) return null;

  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleDateString('fr-FR', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

// Fonction pour formater les dates pour les champs input
function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (date >= DEADLINE_PRIORITE) {
      return '';
    } else {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    console.error('Erreur de formatage de date:', e);
    return '';
  }
}

// Fonction pour afficher et gérer le popup
function togglePopupTodo(todo) {
  const popup = document.getElementById('popup-todo');
  const currentId = popup.dataset.currentTodo;
  const carteActive = document.querySelector('.carte.active');
  const carteCliquee = document.querySelector(`[data-todo-id="${todo.id}"]`);
  const infoColonne = COLONNES_AFFICHAGE.find((colonne) => colonne.id === todo[COLONNES_MAP.STATUT]);

  if (READ_ONLY) {
    fermerPopup();
    return;
  }

  if (carteActive) {
    carteActive.classList.remove('active');
  }

  if (carteCliquee) {
    carteCliquee.classList.add('active');
  }

  popup.style = `border-left-color: ${infoColonne ? infoColonne.couleur : '#009058'}`;

  popup.dataset.statut = todo[COLONNES_MAP.STATUT];
  popup.dataset.isdone = infoColonne ? infoColonne.isdone : false;
  popup.dataset.currentTodo = todo.id;

  const popupTitle = popup.querySelector('.popup-title');
  const content = popup.querySelector('.popup-content');
  const popupheader = popup.querySelector('.popup-header');
  popupheader.style = `background-color: ${infoColonne ? infoColonne.couleur : '#009058'}`;

  popupTitle.textContent = todo[COLONNES_MAP.DESCRIPTION] || 'Nouvelle tâche';

  let form = '<div class="field-row">';
  if (REF_PROJET?.length > 0) {
    form += `
      <div class="field">
        <label class="field-label">Référence Projet</label>
        <select class="field-select" onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.REFERENCE_PROJET}', this.value, event)">`;
    REF_PROJET.forEach(element => {
      form += `<option value="${element}" ${todo[COLONNES_MAP.REFERENCE_PROJET] === element ? 'selected' : ''}>${element}</option>`;
    });
    form += `</select>
      </div>
    `;
  } else {
    form += `
      <div class="field">
        <label class="field-label">Référence Projet</label>
        <input type="text" class="field-input" value="${todo[COLONNES_MAP.REFERENCE_PROJET] || ''}"
               onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.REFERENCE_PROJET}', this.value, event)">
      </div>
    `;
  }

  form += `
    <div class="field">
      <label class="field-label">Date limite</label>
      <input type="date" class="field-input"
             value="${formatDateForInput(todo[COLONNES_MAP.DEADLINE])}"
             onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.DEADLINE}', this.value, event)">
    </div>
  </div>
  <div class="field-row">
  `;

  if (COLONNES_MAP.TYPE) {
    if (TYPES?.length > 0) {
      form += `
        <div class="field">
          <label class="field-label">Type</label>
          <select class="field-select" onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.TYPE}', this.value, event)">`;
      TYPES.forEach(element => {
        form += `<option value="${element}" ${todo[COLONNES_MAP.TYPE] === element ? 'selected' : ''}>${element}</option>`;
      });
      form += `</select>
        </div>
      `;
    } else {
      form += `
        <div class="field">
          <label class="field-label">Type</label>
          <input type="text" class="field-input" value="${todo[COLONNES_MAP.TYPE] || ''}"
                onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.TYPE}', this.value, event)">
        </div>
      `;
    }
  }

  if (COLONNES_MAP.RESPONSABLE) {
    if (PERSONNES?.length > 0) {
      form += `
        <div class="field">
          <label class="field-label">Responsable</label>
          <select class="field-select" onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.RESPONSABLE}', this.value, event)">`;
      PERSONNES.forEach(element => {
        form += `<option value="${element}" ${todo[COLONNES_MAP.RESPONSABLE] === element ? 'selected' : ''}>${element}</option>`;
      });
      form += `</select>
        </div>
      `;
    } else {
      form += `
        <div class="field">
          <label class="field-label">Responsable</label>
          <input type="text" class="field-input" value="${todo[COLONNES_MAP.RESPONSABLE] || ''}"
                onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.RESPONSABLE}', this.value, event)">
        </div>
      `;
    }
  }

  form += `
    </div>
    <div class="field">
      <label class="field-label">Description</label>
      <textarea class="field-textarea auto-expand"
                onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.DESCRIPTION}', this.value, event)"
                oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'">${todo[COLONNES_MAP.DESCRIPTION] || ''}</textarea>
    </div>
  `;

  if (COLONNES_MAP.NOTES) {
    form += `
      <div class="field">
        <label class="field-label">Notes</label>
        <textarea class="field-textarea auto-expand"
                  onchange="mettreAJourChamp(${todo.id}, '${COLONNES_MAP.NOTES}', this.value, event)"
                  oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'">${todo[COLONNES_MAP.NOTES] || ''}</textarea>
      </div>
    `;
  }

  if (COLONNES_MAP.CREE_LE || COLONNES_MAP.CREE_PAR) {
    form += `
      <div class="info-creation">
        Créé ${COLONNES_MAP.CREE_LE ? 'le ' + formatDate(todo[COLONNES_MAP.CREE_LE]) : ''} ${COLONNES_MAP.CREE_PAR ? 'par ' + (todo[COLONNES_MAP.CREE_PAR] || '-') : ''}
      </div>
    `;
  }

  if (!READ_ONLY) {
    form += `
      <div class="popup-actions">
        <button class="popup-action-button bouton-supprimer" onclick="supprimerTodo(${todo.id}, event)"
                title="Supprimer la tâche">🗑️</button>
      </div>
    `;
  }

  content.innerHTML = form;

  setTimeout(() => {
    const textareas = document.querySelectorAll('.auto-expand');
    textareas.forEach(textarea => {
      textarea.style.height = '';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
  }, 0);

  popup.classList.add('visible');
}

// Fonction pour fermer le popup
function fermerPopup() {
  const popup = document.getElementById('popup-todo');
  const todoId = popup.dataset.currentTodo;
  const carteActive = document.querySelector(`[data-todo-id="${todoId}"]`);
  if (carteActive) {
    carteActive.classList.remove('active');
  }
  popup.classList.remove('visible');
}

// Fonction pour créer une nouvelle tâche
async function creerNouvelleTache(colonneId) {
  try {
    let data = { [COLONNES_MAP.DESCRIPTION]: 'Nouvelle tâche', [COLONNES_MAP.STATUT]: colonneId };
    if (COLONNES_MAP.TYPE) data[COLONNES_MAP.TYPE] = '';
    if (COLONNES_MAP.REFERENCE_PROJET) data[COLONNES_MAP.REFERENCE_PROJET] = null;
    if (COLONNES_MAP.DERNIERE_MISE_A_JOUR) data[COLONNES_MAP.DERNIERE_MISE_A_JOUR] = new Date().toISOString();
    if (COLONNES_MAP.CREE_LE) data[COLONNES_MAP.CREE_LE] = new Date().toISOString();

    const res = await TABLE_KANBAN.create({ fields: data });
    if (res.id && res.id > 0) {
      const rec = await grist.fetchSelectedRecord(res.id);
      togglePopupTodo(rec);
    }
  } catch (erreur) {
    console.error('Erreur création:', erreur);
  }
}

// Fonction pour supprimer une tâche
async function supprimerTodo(todoId, e) {
  e?.stopPropagation();
  if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
    try {
      await TABLE_KANBAN.destroy(parseInt(todoId));
      fermerPopup();
    } catch (erreur) {
      console.error('Erreur suppression:', erreur);
    }
  }
}

// Écouteurs d'événements globaux
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    fermerPopup();
  }
});

document.addEventListener('click', (e) => {
  const popup = document.getElementById('popup-todo');
  if (popup.classList.contains('visible')) {
    const popupContent = popup.querySelector('.popup-content');
    if (!popupContent.contains(e.target) && !e.target.closest('.carte') && !e.target.closest('.popup-header')) {
      fermerPopup();
    }
  }
});

// Export des fonctions globales
window.toggleColonne = toggleColonne;
window.togglePopupTodo = togglePopupTodo;
window.fermerPopup = fermerPopup;
window.mettreAJourChamp = mettreAJourChamp;
window.creerNouvelleTache = creerNouvelleTache;
window.supprimerTodo = supprimerTodo;
window.ShowConfig = ShowConfig;
window.closeConfig = closeConfig;
window.saveOption = saveOption;
