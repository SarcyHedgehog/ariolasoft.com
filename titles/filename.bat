@echo off

REM List of game names
set "games=thecastlesofdrcreep archoniiadept marblemadness realmofimpossibility skyfox thesevencitiesofgold batalyx camelotwarriors degas floydthedroid golfconstructionset lapisphilosophorumthephilosophersstone mapsbritain panzadrome paperclip scarabaeus thefourthprotocol think wildwest adventureconstructionset racingdestructionset thebardstale theystoleamillion degaselite hyperforce sepulcri starburstawalkonthewildside starshipandromeda thebigdealfloyd2 theterrorsoftrantoss toadrunner tujad wernerletsgo matrixandlaserzone arcticfox deactivators brideoffrankenstein lendeightonsblitzkrieg triaxos mrsmop voidrunnerhellgate werewolvesoflondon killerring centurionspowerxtreme challengeofthegobots deadringer killerring mountiemicksdeathride outofthisworld pileup starfox zarjaz deathscape dogfight2187 greyfelllegendofnorman hybrid redled ziggurat"

REM Loop through each game name
for %%i in (%games%) do (
    REM Create HTML file
    (
        echo ^<!DOCTYPE html^>
        echo ^<html lang="en"^>
        echo ^<head^>
        echo     ^<meta charset="UTF-8"^>
        echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^>
        echo     ^<title^>%%i^</title^>
        echo     ^<link rel="stylesheet" href="titles.css"^>
        echo ^</head^>
        echo ^<body^>
        echo     ^<div id="image-container" class="card"^>
        echo         ^<img src="images/%%i.png" alt="%%i"^>
        echo     ^</div^>
        echo     ^<div id="text-container"^>
        echo         ^<h2 id="text-header"^>%%i^</h2^>
        echo         ^<textarea id="text-box" readonly^>
        echo            Details about %%i
        echo         ^</textarea^>
        echo     ^</div^>
        echo ^</body^>
        echo ^</html^>
    ) > "%%i.html"
)
