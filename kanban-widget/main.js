/******************************************************************
 * KANBAN GRIST — VERSION STABLE
 ******************************************************************/

let options = {};
let records = [];
let columns = {};
let currentGroupBy = "etat";

grist.ready({ requiredAccess: "full" });

/* -------------------------------------------------- */
/* INIT */
/* -------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  initGrist();
});

function initGrist() {

  grist.onOptions(async (opts) => {
    if (!opts?.table) return;

    options = opts;
    await loadSchema();
    await loadData();
  });
}

/* -------------------------------------------------- */
/* SCHEMA */
/* -------------------------------------------------- */

async function loadSchema() {
  const schema = await grist.docApi.fetchTable(options.table);
  columns = schema.columns.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});
}

/* -------------------------------------------------- */
/* DATA */
/* -------------------------------------------------- */

async function loadData() {
  showLoading(true);

  const data = await grist.docApi.fetchTable(options.table);

  records = convertGristTable(data);

  renderKanban();

  showLoading(false);
}

function convertGristTable(data) {
  const result = [];
  const keys = Object.keys(data);

  for (let i = 0; i < data.id.length; i++) {
    const row = {};
    keys.forEach(k => row[k] = data[k][i]);
    result.push(row);
  }
  return result;
}

/* -------------------------------------------------- */
/* RENDER */
/* -------------------------------------------------- */

function renderKanban() {

  const container = document.getElementById("kanbanContainer");
  container.innerHTML = "";

  const statusCol = options.statusCol;

  const groups = {};

  records.forEach(r => {
    const value = r[statusCol] || "Sans état";
    if (!groups[value]) groups[value] = [];
    groups[value].push(r);
  });

  Object.entries(groups).forEach(([status, tasks]) => {

    const column = document.createElement("div");
    column.className = "kanban-column";

    column.innerHTML = `
      <div class="kanban-column-header">${status}</div>
      <div class="kanban-tasks" data-status="${status}"></div>
    `;

    const taskContainer = column.querySelector(".kanban-tasks");

    tasks.forEach(t => {
      taskContainer.appendChild(renderTaskCard(t));
    });

    container.appendChild(column);

    new Sortable(taskContainer, {
      group: "kanban",
      animation: 150,
      onEnd: async (evt) => {
        const id = Number(evt.item.dataset.id);
        await updateStatus(id, evt.to.dataset.status);
      }
    });

  });
}

/* -------------------------------------------------- */
/* CARD */
/* -------------------------------------------------- */

function renderTaskCard(task) {

  const div = document.createElement("div");
  div.className = "task-card";
  div.dataset.id = task.id;

  div.innerHTML = `
    <div class="task-title">${task[options.titleCol] || "(sans nom)"}</div>
  `;

  div.onclick = () => openEditModal(task);

  return div;
}

/* -------------------------------------------------- */
/* UPDATE */
/* -------------------------------------------------- */

async function updateStatus(id, newStatus) {

  await grist.docApi.applyUserActions([
    ["UpdateRecord", options.table, id, {
      [options.statusCol]: newStatus
    }]
  ]);

  await loadData();
}

/* -------------------------------------------------- */
/* MODAL */
/* -------------------------------------------------- */

function openCreateModal() {
  document.getElementById("taskModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("taskModal").style.display = "none";
}

async function saveTask() {

  const name = document.getElementById("taskNom").value;

  await grist.docApi.applyUserActions([
    ["AddRecord", options.table, null, {
      [options.titleCol]: name
    }]
  ]);

  closeModal();
  await loadData();
}

/* -------------------------------------------------- */
/* UI */
/* -------------------------------------------------- */

function showLoading(show) {
  document.getElementById("loadingOverlay").style.display =
    show ? "flex" : "none";
}

/* -------------------------------------------------- */
/* GLOBAL (IMPORTANT POUR TON HTML) */
/* -------------------------------------------------- */

window.openCreateModal = openCreateModal;
window.closeModal = closeModal;
window.saveTask = saveTask;
window.changeGroupBy = (v)=>{currentGroupBy=v;renderKanban();}
window.handleSearch = ()=>{};
window.toggleFilterMenu = ()=>{};
window.toggleMultiSelect = ()=>{};
window.deleteTask = ()=>{};