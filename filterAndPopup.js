function filterTable(columnIndex) {
  var filterValues = [];
  var filterSelects = document.getElementsByClassName("filter");
  for (var i = 0; i < filterSelects.length; i++) {
    filterValues.push(filterSelects[i].value);
  }

  var table = document.getElementById("myTable");
  var rows = table.getElementsByTagName("tr");

  for (var rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    var cells = rows[rowIndex].getElementsByTagName("td");
    var showRow = true;
    for (var cellIndex = 1; cellIndex < cells.length; cellIndex++) {
      var cellText = cells[cellIndex].innerText || cells[cellIndex].textContent;
      if (
        filterValues[cellIndex - 1] !== "all" &&
        cellText.trim().toUpperCase() !== filterValues[cellIndex - 1].toUpperCase()
      ) {
        showRow = false;
        break;
      }
    }
    rows[rowIndex].style.display = showRow ? "" : "none";
  }
}

function openPopup(url) {
  var dialog = document.getElementById("catalog-detail-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "catalog-detail-dialog";
    dialog.className = "catalog-detail-dialog";
    dialog.innerHTML =
      '<div class="catalog-detail-frame">' +
      '<button class="catalog-detail-close" type="button" aria-label="Close details">&times;</button>' +
      '<iframe title="Catalogue details" loading="eager"></iframe>' +
      "</div>";
    document.body.appendChild(dialog);

    dialog.querySelector(".catalog-detail-close").addEventListener("click", function () {
      dialog.close();
    });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        dialog.close();
      }
    });
    dialog.addEventListener("close", function () {
      dialog.querySelector("iframe").src = "about:blank";
    });
  }

  dialog.querySelector("iframe").src = url;
  dialog.showModal();
  return false;
}

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("#myTable a[onclick^='openPopup']").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
    });
  });

  // Convert platform Yes/No values to dots while retaining hidden text for
  // the existing filters.
  document.querySelectorAll("#myTable tbody tr").forEach(function (row) {
    row.querySelectorAll("td").forEach(function (cell, index) {
      if (index < 4) {
        return;
      }

      var text = cell.textContent.trim().toLowerCase();
      if (text === "yes") {
        cell.className = "platform-yes";
        cell.innerHTML = '<span aria-hidden="true">●</span><span class="visually-hidden">Yes</span>';
      } else if (text === "no") {
        cell.className = "platform-no";
        cell.innerHTML = '<span aria-hidden="true">○</span><span class="visually-hidden">No</span>';
      }
    });
  });
});
