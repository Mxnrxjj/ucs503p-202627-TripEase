#!/bin/sh
# Builds the report figures from the diagram sources in docs/diagrams.
# The sources are not changed. For the report we drop the title inside each
# diagram (the figure caption replaces it) and enlarge the text so that it
# stays readable at page width. DFD level 1 is laid out top to bottom here
# because the left-to-right version is too wide for a portrait page.
# Run from this folder: sh make-figures.sh
set -e
SRC=../../docs/diagrams
# Removes the graph title, which is the only label="..."; statement that ends
# with a semicolon in these files.
untitle() { sed -e 's/label="[^"]*";//' "$1"; }

untitle $SRC/arch.dot | dot -Tpdf -o arch.pdf
untitle $SRC/dfd0.dot | sed -e "s/fontsize=9\]/fontsize=11]/" | dot -Tpdf -o dfd0.pdf
untitle $SRC/dfd1.dot \
  | sed -e 's/rankdir=LR; nodesep=0.5; ranksep=1.1;/rankdir=TB; nodesep=0.45; ranksep=0.55;/' \
        -e 's/fontsize=10\]/fontsize=18]/' -e 's/fontsize=8\]/fontsize=16]/' \
        -e 's/width=1.3, fixedsize=true/width=2.2, fixedsize=true/' \
  | dot -Tpdf -o dfd1.pdf
untitle $SRC/er-overview.dot | neato -Tpdf -o er-overview.pdf
# The use case diagram refers to actor.png by a relative path.
untitle $SRC/usecase.dot \
  | sed -e 's/fontsize=12,/fontsize=18,/g' -e 's/fontsize=10\]/fontsize=15]/' \
        -e 's/label="TripEase", labelloc=t, fontsize=18/label="TripEase", labelloc=t, fontsize=22/' \
  > usecase.tmp.dot
cp $SRC/actor.png actor.png
neato -n -Tpdf usecase.tmp.dot -o usecase.pdf
rm -f usecase.tmp.dot actor.png
# The activity diagram uses its own copy, activity-report.dot, in this folder.
# It has the same actions, guards and lanes as $SRC/activity.dot, but a
# tighter layout so that the text stays readable on a portrait page.
neato -n -Tpdf activity-report.dot -o activity.pdf
