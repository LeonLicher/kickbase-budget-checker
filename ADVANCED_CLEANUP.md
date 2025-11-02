# Advanced Git History Cleaning with git-filter-repo

## Install git-filter-repo first:
# pip install git-filter-repo

## Remove specific files from entire history:
git filter-repo --path .env --invert-paths

## Remove specific text/passwords from entire history:
git filter-repo --replace-text replacements.txt

## Where replacements.txt contains:
# OLD_PASSWORD==>***REMOVED***
# specific-sensitive-string==>***REMOVED***

## Force push the cleaned history:
git push -f origin main