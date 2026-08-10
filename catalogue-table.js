(function () {
  "use strict";

  var platformKeys = [
    "c64", "cpc", "spectrum", "atari8", "msx", "msdos",
    "pcbooter", "atarist", "amiga", "apple2", "pcw", "c16"
  ];

  function addCell(row, text) {
    var cell = document.createElement("td");
    cell.textContent = text;
    row.appendChild(cell);
    return cell;
  }

  function addPlatformCell(row, enabled) {
    var cell = addCell(row, enabled ? "Yes" : "No");
    cell.className = enabled ? "platform-yes" : "platform-no";
    cell.innerHTML = '<span aria-hidden="true">' + (enabled ? "\u25cf" : "\u25cb") +
      '</span><span class="visually-hidden">' + (enabled ? "Yes" : "No") + "</span>";
  }

  function populateSelect(select, values) {
    var current = select.value;
    select.replaceChildren(new Option("All", "all"));
    values.forEach(function (value) { select.add(new Option(value, value)); });
    select.value = values.indexOf(current) >= 0 ? current : "all";
  }

  function renderCatalogue(records) {
    var tbody = document.querySelector("#myTable tbody");
    tbody.replaceChildren();
    records.forEach(function (record) {
      var row = document.createElement("tr");
      var titleCell = document.createElement("td");
      var link = document.createElement("a");
      link.href = "titles/" + record.slug + ".html";
      link.textContent = record.title;
      link.addEventListener("click", function (event) {
        event.preventDefault();
        openPopup(link.href);
      });
      titleCell.appendChild(link);
      row.appendChild(titleCell);
      addCell(row, String(record.year));
      addCell(row, record.developer);
      addCell(row, record.label);
      platformKeys.forEach(function (key) {
        addPlatformCell(row, record.platforms.indexOf(key) >= 0);
      });
      tbody.appendChild(row);
    });

    var filters = document.querySelectorAll("#myTable thead select.filter");
    populateSelect(filters[0], Array.from(new Set(records.map(function (r) { return String(r.year); }))).sort());
    populateSelect(filters[1], Array.from(new Set(records.map(function (r) { return r.developer; }))).sort());
    populateSelect(filters[2], Array.from(new Set(records.map(function (r) { return r.label; }))).sort());
  }

  document.addEventListener("DOMContentLoaded", function () {
    fetch("catalogue.json", { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("Catalogue data could not be loaded.");
        return response.json();
      })
      .then(renderCatalogue)
      .catch(function (error) {
        console.warn(error.message + " Using the embedded catalogue table.");
      });
  });
})();
