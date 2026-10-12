# Week 4 : Preparing the Mid-Semester Report and Cleaning Up the Repository

# Report and Repository Cleanup

## Problem 1: The diagrams were too small in the report

Once the activity diagram was in the report, its text was too small to read
at page width, and adding it made LaTeX leave half-empty pages near it.

### Solution

The report uses its own copy of the diagram, `activity-report.dot`, with a
tighter layout and larger text. It has the same actions, guards and lanes
as the version in `docs`; I compared the labels and all 29 arrows to be
sure. For the floats, I kept the page fraction of the figures at 0.8,
because lower values broke the table pages in chapter 1, and I gave the use
case figure its own float page instead. I then looked at all 25 pages one by
one and checked the build for warnings and for unresolved references.

## Problem 2: Leftovers from the course template

The repository still had the template's site title, links, author name and
package metadata, and two sample journals from the template.

### Solution

I replaced them with the TripEase details in `mkdocs.yml`, `pyproject.toml`
and the docs home page, removed the sample journals, and added a
`journals/index.md` so that the folder still works in the documentation
site. I removed the `site_url` of the template and left it out until we have
our own documentation address.

## Problem 3: Files showed as modified on Windows

Git on Windows warned that LF would be replaced by CRLF and listed many
files as modified.

### Solution

I compared the files with the line endings ignored and saw that only the
line endings were different. I then added only the files I meant to change,
and checked each commit with `git diff --cached --stat` before committing.

## Problem 4: A failed preview deployment

The preview deployment of the cleanup pull request failed on Vercel, even
though the pull request changed only documentation and configuration files.

### Solution

I checked that nothing under `code/` had been changed and that the other
checks had passed. Redeploying the same commit made all checks pass. I did
not find the cause of the first failure, so I treat it as a one-off.
