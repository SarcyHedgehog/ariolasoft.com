(function () {
  "use strict";
  var repo = "SarcyHedgehog/ariolasoft.com";
  var platforms = [
    ["c64", "Commodore 64"], ["cpc", "Amstrad CPC"], ["spectrum", "ZX Spectrum"],
    ["atari8", "Atari 8-bit"], ["msx", "MSX"], ["msdos", "MS-DOS"],
    ["pcbooter", "PC Booter"], ["atarist", "Atari ST"], ["amiga", "Amiga"],
    ["apple2", "Apple II"], ["pcw", "Amstrad PCW"], ["c16", "Commodore 16"]
  ];
  var records = [];
  var selected = null;
  var form = document.getElementById("suggestion-form");
  var picker = document.getElementById("title-picker");
  var platformBox = document.getElementById("platforms");
  var status = document.getElementById("status");

  platforms.forEach(function (item) {
    var label = document.createElement("label");
    label.innerHTML = '<input type="checkbox" name="platform" value="' + item[0] + '">' + item[1];
    platformBox.appendChild(label);
  });

  function setValue(name, value) { form.elements[name].value = value || ""; }
  function chooseRecord(slug) {
    selected = records.find(function (record) { return record.slug === slug; });
    if (!selected) return;
    setValue("title", selected.title);
    setValue("year", selected.year);
    setValue("developer", selected.developer);
    setValue("label", selected.label);
    setValue("description", selected.description);
    setValue("sources", selected.sources);
    setValue("imageSuggestion", "");
    setValue("notes", "");
    form.querySelectorAll('[name="platform"]').forEach(function (checkbox) {
      checkbox.checked = selected.platforms.indexOf(checkbox.value) >= 0;
    });
    status.textContent = "Loaded “" + selected.title + "”. Change only what needs correcting.";
  }

  fetch("catalogue.json", { cache: "no-cache" }).then(function (response) {
    if (!response.ok) throw new Error("The catalogue could not be loaded.");
    return response.json();
  }).then(function (data) {
    records = data;
    data.forEach(function (record) { picker.add(new Option(record.title, record.slug)); });
    var requested = new URLSearchParams(location.search).get("title");
    picker.value = records.some(function (r) { return r.slug === requested; }) ? requested : records[0].slug;
    chooseRecord(picker.value);
  }).catch(function (error) { status.textContent = error.message; });

  picker.addEventListener("change", function () { chooseRecord(picker.value); });
  document.getElementById("reset-record").addEventListener("click", function () { chooseRecord(picker.value); });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!selected) return;
    var suggestion = {
      schema: 1,
      slug: selected.slug,
      title: form.elements.title.value.trim(),
      year: Number(form.elements.year.value),
      developer: form.elements.developer.value.trim(),
      label: form.elements.label.value.trim(),
      platforms: Array.from(form.querySelectorAll('[name="platform"]:checked')).map(function (box) { return box.value; }),
      description: form.elements.description.value.trim(),
      sources: form.elements.sources.value.trim(),
      imageSuggestion: form.elements.imageSuggestion.value.trim(),
      notes: form.elements.notes.value.trim()
    };
    var readable = "Thank you for helping improve the Ariolasoft catalogue. This submission will be checked before anything is published.\n\n" +
      "Title: " + suggestion.title + "\nSubmitted from: " + location.href + "\n\n" +
      "<!-- ARIOLASOFT_CATALOGUE_SUGGESTION\n" + JSON.stringify(suggestion, null, 2) + "\n-->";
    var url = "https://github.com/" + repo + "/issues/new?title=" +
      encodeURIComponent("[Catalogue] " + suggestion.title) + "&body=" + encodeURIComponent(readable);
    if (url.length < 7500) {
      window.open(url, "_blank", "noopener");
      status.textContent = "Your suggestion is ready. Sign in if asked, then press “Submit new issue”.";
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(readable).then(function () {
        window.open("https://github.com/" + repo + "/issues/new?title=" +
          encodeURIComponent("[Catalogue] " + suggestion.title), "_blank", "noopener");
        status.textContent = "This is a long contribution, so it has been copied. Paste it into the form that just opened.";
      });
    } else {
      status.textContent = "This contribution is too long to transfer automatically. Please shorten the notes or description slightly.";
    }
  });
})();
