// Synced from micro23/deluge-deck 1.0.105 · 985ee12.
import type { DeckThemeId } from './ipc-contract';
export const DECK_THEME_ORDER: DeckThemeId[] = [
    "darkhand",
    "terminal",
    "matrix",
    "dark",
    "light",
    "ocean",
    "forest",
    "sunset",
    "christmas",
    "halloween",
    "valentine",
    "st-patricks",
    "independence",
    "new-year",
    "yankees",
    "mets",
    "dodgers",
    "red-sox",
    "blue-jays",
    "cubs",
    "knicks",
    "lakers",
    "warriors",
    "bulls",
    "cavaliers",
    "heat",
    "giants",
    "cowboys",
    "eagles",
    "patriots",
    "chiefs",
    "steelers",
    "rangers",
    "blackhawks",
    "penguins",
    "bruins",
    "maple-leafs",
    "canadiens"
];
export const DECK_THEME_CATEGORIES = [
    {
        "id": "regular",
        "label": "Regular themes",
        "themes": [
            "darkhand",
            "terminal",
            "matrix",
            "dark",
            "light",
            "ocean",
            "forest",
            "sunset"
        ]
    },
    {
        "id": "holiday",
        "label": "Holiday themes",
        "themes": [
            "christmas",
            "halloween",
            "valentine",
            "st-patricks",
            "independence",
            "new-year"
        ]
    },
    {
        "id": "sports",
        "label": "Sports themes",
        "themes": [
            "yankees",
            "mets",
            "dodgers",
            "red-sox",
            "blue-jays",
            "cubs",
            "knicks",
            "lakers",
            "warriors",
            "bulls",
            "cavaliers",
            "heat",
            "giants",
            "cowboys",
            "eagles",
            "patriots",
            "chiefs",
            "steelers",
            "rangers",
            "blackhawks",
            "penguins",
            "bruins",
            "maple-leafs",
            "canadiens"
        ],
        "groups": [
            {
                "id": "baseball",
                "label": "Baseball",
                "themes": [
                    "yankees",
                    "mets",
                    "dodgers",
                    "red-sox",
                    "blue-jays",
                    "cubs"
                ]
            },
            {
                "id": "basketball",
                "label": "Basketball",
                "themes": [
                    "knicks",
                    "lakers",
                    "warriors",
                    "bulls",
                    "cavaliers",
                    "heat"
                ]
            },
            {
                "id": "football",
                "label": "Football",
                "themes": [
                    "giants",
                    "cowboys",
                    "eagles",
                    "patriots",
                    "chiefs",
                    "steelers"
                ]
            },
            {
                "id": "hockey",
                "label": "Hockey",
                "themes": [
                    "rangers",
                    "blackhawks",
                    "penguins",
                    "bruins",
                    "maple-leafs",
                    "canadiens"
                ]
            }
        ]
    }
];
export const DECK_THEME_TITLES: Record<DeckThemeId, string> = {
    "darkhand": "Darkhand",
    "terminal": "Terminal",
    "matrix": "The Matrix",
    "dark": "Midnight",
    "light": "Paper",
    "ocean": "Ocean",
    "forest": "Forest",
    "sunset": "Sunset",
    "christmas": "Christmas",
    "halloween": "Halloween",
    "valentine": "Valentine’s",
    "st-patricks": "St. Patrick’s",
    "independence": "USA",
    "new-year": "New Year",
    "yankees": "NY Yankees",
    "giants": "NY Giants",
    "knicks": "NY Knicks",
    "dodgers": "LA Dodgers",
    "red-sox": "Boston Red Sox",
    "blue-jays": "Toronto Blue Jays",
    "cubs": "Chicago Cubs",
    "lakers": "LA Lakers",
    "warriors": "GS Warriors",
    "bulls": "Chicago Bulls",
    "cavaliers": "Cleveland Cavaliers",
    "heat": "Miami Heat",
    "cowboys": "Dallas Cowboys",
    "eagles": "Philadelphia Eagles",
    "patriots": "NE Patriots",
    "chiefs": "KC Chiefs",
    "steelers": "Pittsburgh Steelers",
    "rangers": "NY Rangers",
    "blackhawks": "Chicago Blackhawks",
    "penguins": "Pittsburgh Penguins",
    "bruins": "Boston Bruins",
    "maple-leafs": "Toronto Maple Leafs",
    "canadiens": "Montreal Canadiens",
    "mets": "NY Mets"
};
export const DECK_SPORTS_CLUBS = {
    "yankees": {
        "established": 1903,
        "venue": "Yankee Stadium",
        "opened": 2009,
        "titles": 27,
        "name": "New York Yankees",
        "short": "Yankees",
        "city": "New York",
        "sport": "Baseball",
        "label": "NY Yankees",
        "description": "Est. 1903. Yankee Stadium opened 2009.",
        "logoSource": "https://www.mlbstatic.com/team-logos/147.svg"
    },
    "giants": {
        "established": 1925,
        "venue": "MetLife Stadium",
        "opened": 2010,
        "titles": 4,
        "name": "New York Giants",
        "short": "Giants",
        "city": "New York",
        "sport": "Football",
        "label": "NY Giants",
        "description": "Est. 1925. MetLife Stadium opened 2010.",
        "logoSource": "https://static.www.nfl.com/t_headshot_desktop/league/api/clubs/logos/NYG"
    },
    "knicks": {
        "established": 1946,
        "venue": "Madison Square Garden",
        "opened": 1968,
        "titles": 3,
        "name": "New York Knicks",
        "short": "Knicks",
        "city": "New York",
        "sport": "Basketball",
        "label": "NY Knicks",
        "description": "Est. 1946. Madison Square Garden opened 1968.",
        "logoSource": "https://cdn.nba.com/logos/nba/1610612752/primary/L/logo.svg"
    },
    "dodgers": {
        "established": 1883,
        "venue": "Dodger Stadium",
        "opened": 1962,
        "titles": 9,
        "name": "Los Angeles Dodgers",
        "short": "Dodgers",
        "city": "Los Angeles",
        "sport": "Baseball",
        "label": "LA Dodgers",
        "description": "Est. 1883. Dodger Stadium opened 1962.",
        "logoSource": "https://www.mlbstatic.com/team-logos/119.svg",
        "primary": "#005a9c",
        "secondary": "#ef3e42",
        "accent": "#b7dcff",
        "material": "porcelain"
    },
    "red-sox": {
        "established": 1901,
        "venue": "Fenway Park",
        "opened": 1912,
        "titles": 9,
        "name": "Boston Red Sox",
        "short": "Red Sox",
        "city": "Boston",
        "sport": "Baseball",
        "label": "Boston Red Sox",
        "description": "Est. 1901. Fenway Park opened 1912.",
        "logoSource": "https://www.mlbstatic.com/team-logos/111.svg",
        "primary": "#bd3039",
        "secondary": "#0c2340",
        "accent": "#ffbfc3",
        "material": "dark"
    },
    "blue-jays": {
        "established": 1977,
        "venue": "Rogers Centre",
        "opened": 1989,
        "titles": 2,
        "name": "Toronto Blue Jays",
        "short": "Blue Jays",
        "city": "Toronto",
        "sport": "Baseball",
        "label": "Toronto Blue Jays",
        "description": "Est. 1977. Rogers Centre opened 1989.",
        "logoSource": "https://www.mlbstatic.com/team-logos/141.svg",
        "primary": "#134a8e",
        "secondary": "#e8291c",
        "accent": "#b8dcff",
        "material": "porcelain"
    },
    "cubs": {
        "established": 1876,
        "venue": "Wrigley Field",
        "opened": 1914,
        "titles": 3,
        "name": "Chicago Cubs",
        "short": "Cubs",
        "city": "Chicago",
        "sport": "Baseball",
        "label": "Chicago Cubs",
        "description": "Est. 1876. Wrigley Field opened 1914.",
        "logoSource": "https://www.mlbstatic.com/team-logos/112.svg",
        "primary": "#0e3386",
        "secondary": "#cc3433",
        "accent": "#c4d7ff",
        "material": "porcelain"
    },
    "lakers": {
        "established": 1947,
        "venue": "Crypto.com Arena",
        "opened": 1999,
        "titles": 17,
        "name": "Los Angeles Lakers",
        "short": "Lakers",
        "city": "Los Angeles",
        "sport": "Basketball",
        "label": "LA Lakers",
        "description": "Est. 1947. Crypto.com Arena opened 1999.",
        "logoSource": "https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg",
        "primary": "#552583",
        "secondary": "#fdb927",
        "accent": "#ffe2a4",
        "material": "dark"
    },
    "warriors": {
        "established": 1946,
        "venue": "Chase Center",
        "opened": 2019,
        "titles": 7,
        "name": "Golden State Warriors",
        "short": "Warriors",
        "city": "San Francisco",
        "sport": "Basketball",
        "label": "GS Warriors",
        "description": "Est. 1946. Chase Center opened 2019.",
        "logoSource": "https://cdn.nba.com/logos/nba/1610612744/primary/L/logo.svg",
        "primary": "#1d428a",
        "secondary": "#ffc72c",
        "accent": "#ffe59a",
        "material": "dark"
    },
    "bulls": {
        "established": 1966,
        "venue": "United Center",
        "opened": 1994,
        "titles": 6,
        "name": "Chicago Bulls",
        "short": "Bulls",
        "city": "Chicago",
        "sport": "Basketball",
        "label": "Chicago Bulls",
        "description": "Est. 1966. United Center opened 1994.",
        "logoSource": "https://cdn.nba.com/logos/nba/1610612741/primary/L/logo.svg",
        "primary": "#ce1141",
        "secondary": "#171717",
        "accent": "#ffbecd",
        "material": "dark"
    },
    "cavaliers": {
        "established": 1970,
        "venue": "Rocket Arena",
        "opened": 1994,
        "titles": 1,
        "name": "Cleveland Cavaliers",
        "short": "Cavaliers",
        "city": "Cleveland",
        "sport": "Basketball",
        "label": "Cleveland Cavaliers",
        "description": "Est. 1970. Rocket Arena opened 1994.",
        "logoSource": "https://cdn.nba.com/logos/nba/1610612739/primary/L/logo.svg",
        "primary": "#860038",
        "secondary": "#fdbb30",
        "accent": "#ffe1a2",
        "material": "dark"
    },
    "heat": {
        "established": 1988,
        "venue": "Kaseya Center",
        "opened": 1999,
        "titles": 3,
        "name": "Miami Heat",
        "short": "Heat",
        "city": "Miami",
        "sport": "Basketball",
        "label": "Miami Heat",
        "description": "Est. 1988. Kaseya Center opened 1999.",
        "logoSource": "https://cdn.nba.com/logos/nba/1610612748/primary/L/logo.svg",
        "primary": "#98002e",
        "secondary": "#f9a01b",
        "accent": "#ffd6a1",
        "material": "dark"
    },
    "cowboys": {
        "established": 1960,
        "venue": "AT&T Stadium",
        "opened": 2009,
        "titles": 5,
        "name": "Dallas Cowboys",
        "short": "Cowboys",
        "city": "Dallas",
        "sport": "Football",
        "label": "Dallas Cowboys",
        "description": "Est. 1960. AT&T Stadium opened 2009.",
        "logoSource": "https://static.www.nfl.com/t_headshot_desktop/league/api/clubs/logos/DAL",
        "primary": "#003594",
        "secondary": "#869397",
        "accent": "#d7e5f7",
        "material": "porcelain"
    },
    "eagles": {
        "established": 1933,
        "venue": "Lincoln Financial Field",
        "opened": 2003,
        "titles": 2,
        "name": "Philadelphia Eagles",
        "short": "Eagles",
        "city": "Philadelphia",
        "sport": "Football",
        "label": "Philadelphia Eagles",
        "description": "Est. 1933. Lincoln Financial Field opened 2003.",
        "logoSource": "https://static.www.nfl.com/t_headshot_desktop/league/api/clubs/logos/PHI",
        "primary": "#004c54",
        "secondary": "#a5acaf",
        "accent": "#b8eee3",
        "material": "dark"
    },
    "patriots": {
        "established": 1960,
        "venue": "Gillette Stadium",
        "opened": 2002,
        "titles": 6,
        "name": "New England Patriots",
        "short": "Patriots",
        "city": "New England",
        "sport": "Football",
        "label": "NE Patriots",
        "description": "Est. 1960. Gillette Stadium opened 2002.",
        "logoSource": "https://static.www.nfl.com/t_headshot_desktop/league/api/clubs/logos/NE",
        "primary": "#002244",
        "secondary": "#c60c30",
        "accent": "#cbdfff",
        "material": "dark"
    },
    "chiefs": {
        "established": 1960,
        "venue": "GEHA Field at Arrowhead Stadium",
        "opened": 1972,
        "titles": 4,
        "name": "Kansas City Chiefs",
        "short": "Chiefs",
        "city": "Kansas City",
        "sport": "Football",
        "label": "KC Chiefs",
        "description": "Est. 1960. GEHA Field at Arrowhead Stadium opened 1972.",
        "logoSource": "https://static.www.nfl.com/t_headshot_desktop/league/api/clubs/logos/KC",
        "primary": "#e31837",
        "secondary": "#ffb81c",
        "accent": "#ffd7a1",
        "material": "dark"
    },
    "steelers": {
        "established": 1933,
        "venue": "Acrisure Stadium",
        "opened": 2001,
        "titles": 6,
        "name": "Pittsburgh Steelers",
        "short": "Steelers",
        "city": "Pittsburgh",
        "sport": "Football",
        "label": "Pittsburgh Steelers",
        "description": "Est. 1933. Acrisure Stadium opened 2001.",
        "logoSource": "https://static.www.nfl.com/t_headshot_desktop/league/api/clubs/logos/PIT",
        "primary": "#171717",
        "secondary": "#ffb612",
        "accent": "#ffe28f",
        "material": "dark"
    },
    "rangers": {
        "established": 1926,
        "venue": "Madison Square Garden",
        "opened": 1968,
        "titles": 4,
        "name": "New York Rangers",
        "short": "Rangers",
        "city": "New York",
        "sport": "Hockey",
        "label": "NY Rangers",
        "description": "Est. 1926. Madison Square Garden opened 1968.",
        "logoSource": "https://assets.nhle.com/logos/nhl/svg/NYR_dark.svg",
        "primary": "#0038a8",
        "secondary": "#ce1126",
        "accent": "#c9deff",
        "material": "ice"
    },
    "blackhawks": {
        "established": 1926,
        "venue": "United Center",
        "opened": 1994,
        "titles": 6,
        "name": "Chicago Blackhawks",
        "short": "Blackhawks",
        "city": "Chicago",
        "sport": "Hockey",
        "label": "Chicago Blackhawks",
        "description": "Est. 1926. United Center opened 1994.",
        "logoSource": "https://assets.nhle.com/logos/nhl/svg/CHI_dark.svg",
        "primary": "#cf0a2c",
        "secondary": "#111111",
        "accent": "#ffbdc7",
        "material": "dark"
    },
    "penguins": {
        "established": 1967,
        "venue": "PPG Paints Arena",
        "opened": 2010,
        "titles": 5,
        "name": "Pittsburgh Penguins",
        "short": "Penguins",
        "city": "Pittsburgh",
        "sport": "Hockey",
        "label": "Pittsburgh Penguins",
        "description": "Est. 1967. PPG Paints Arena opened 2010.",
        "logoSource": "https://assets.nhle.com/logos/nhl/svg/PIT_dark.svg",
        "primary": "#111111",
        "secondary": "#ffb81c",
        "accent": "#ffe399",
        "material": "dark"
    },
    "bruins": {
        "established": 1924,
        "venue": "TD Garden",
        "opened": 1995,
        "titles": 6,
        "name": "Boston Bruins",
        "short": "Bruins",
        "city": "Boston",
        "sport": "Hockey",
        "label": "Boston Bruins",
        "description": "Est. 1924. TD Garden opened 1995.",
        "logoSource": "https://assets.nhle.com/logos/nhl/svg/BOS_dark.svg",
        "primary": "#111111",
        "secondary": "#ffb81c",
        "accent": "#ffe59f",
        "material": "ice"
    },
    "maple-leafs": {
        "established": 1917,
        "venue": "Scotiabank Arena",
        "opened": 1999,
        "titles": 13,
        "name": "Toronto Maple Leafs",
        "short": "Maple Leafs",
        "city": "Toronto",
        "sport": "Hockey",
        "label": "Toronto Maple Leafs",
        "description": "Est. 1917. Scotiabank Arena opened 1999.",
        "logoSource": "https://assets.nhle.com/logos/nhl/svg/TOR_dark.svg",
        "primary": "#00205b",
        "secondary": "#ffffff",
        "accent": "#c8ddff",
        "material": "ice"
    },
    "canadiens": {
        "established": 1909,
        "venue": "Bell Centre",
        "opened": 1996,
        "titles": 24,
        "name": "Montreal Canadiens",
        "short": "Canadiens",
        "city": "Montreal",
        "sport": "Hockey",
        "label": "Montreal Canadiens",
        "description": "Est. 1909. Bell Centre opened 1996.",
        "logoSource": "https://assets.nhle.com/logos/nhl/svg/MTL_dark.svg",
        "primary": "#af1e2d",
        "secondary": "#192168",
        "accent": "#ffc6ce",
        "material": "ice"
    },
    "mets": {
        "established": 1962,
        "venue": "Citi Field",
        "opened": 2009,
        "titles": 2,
        "name": "New York Mets",
        "short": "Mets",
        "city": "Queens, New York",
        "sport": "Baseball",
        "label": "NY Mets",
        "description": "Est. 1962. Citi Field opened 2009.",
        "logoSource": "https://www.mlbstatic.com/team-logos/121.svg",
        "material": "bespoke"
    }
};

export const DECK_SPORTS_DESIGNS = {
    "yankees": {
        "signature": "Bronx pinstripes",
        "lettering": "serif",
        "motif": "M18 100V30h84v70M12 30h96M18 20h84M30 30v70m15-70v70m15-70v70m15-70v70m15-70v70M12 100h96"
    },
    "giants": {
        "signature": "Big Blue gridiron",
        "lettering": "block",
        "motif": "M20 104V18h80v86M20 35h80M20 60h80M20 85h80M40 18v86m40-86v86M52 27h16m-16 25h16m-16 25h16m-16 25h16"
    },
    "knicks": {
        "signature": "Garden hardwood",
        "lettering": "slant",
        "motif": "M15 90V32h90v58ZM15 62h90M45 62v28m30-28v28M38 32l22-18 22 18M34 47h52M40 103h40"
    },
    "dodgers": {
        "signature": "Los Angeles script",
        "lettering": "script",
        "motif": "M14 93h92M22 87V46m16 41V31m44 56V31m16 56V46M12 46h30m36 0h30M23 31h30m14 0h30M60 14v62M44 75h32M44 23l16-9 16 9"
    },
    "red-sox": {
        "signature": "Fenway brick",
        "lettering": "serif",
        "motif": "M14 97V34h92v63ZM14 49h92M14 65h92M14 81h92M30 34v15m30-15v15m30-15v15M45 49v16m30-16v16M30 65v16m30-16v16m30-16v16M45 81v16m30-16v16M24 24h72"
    },
    "blue-jays": {
        "signature": "Northern dome",
        "lettering": "round",
        "motif": "M12 87a48 48 0 0 1 96 0ZM24 87a36 36 0 0 1 72 0M39 87a21 40 0 0 1 42 0M60 39v48M12 97h96M52 21l8-10 8 10-8 9Z"
    },
    "cubs": {
        "signature": "Ivy & marquee",
        "lettering": "serif",
        "motif": "M15 32h90v40H15ZM22 39h76v26H22ZM30 72v29m60-29v29M17 102h86M26 21h68M14 95c18-29 32-7 42-20m64 20c-18-29-32-7-42-20"
    },
    "lakers": {
        "signature": "Championship velvet",
        "lettering": "serif",
        "motif": "M22 82l-8-46 25 19 21-35 21 35 25-19-8 46ZM22 94h76M32 104h56M38 71h44M60 36v35"
    },
    "warriors": {
        "signature": "Bay bridge",
        "lettering": "round",
        "motif": "M12 91h96M30 104V26h12v78m36 0V26h12v78M12 44Q60 90 108 44M12 64Q60 102 108 64M18 54v37m36-18v18m12-18v18m36-37v37M26 26h20m28 0h20"
    },
    "bulls": {
        "signature": "Chicago steel",
        "lettering": "block",
        "motif": "M16 104V57h20v47m6 0V30h18v74m6 0V17h18v87m6 0V45h16v59M10 104h100M70 17V8M46 30V20M24 70h5m19-25h5m19-12h5m19 30h5"
    },
    "cavaliers": {
        "signature": "Wine & gilded enamel",
        "lettering": "serif",
        "motif": "M25 18h70v46c0 22-35 42-35 42S25 86 25 64ZM37 31h46v29c0 15-23 30-23 30S37 75 37 60ZM60 20v66M16 98l87-80M91 16l14 14"
    },
    "heat": {
        "signature": "Miami afterburn",
        "lettering": "slant",
        "motif": "M60 107C12 90 26 53 43 38c-3 20 10 24 10 24S50 24 77 10c-10 37 34 43 17 76-5 10-16 18-34 21ZM60 96c-22-14-12-33 0-43 0 20 23 21 12 36M19 108h82"
    },
    "cowboys": {
        "signature": "Silver star armor",
        "lettering": "block",
        "motif": "M60 12l12 31 34 2-26 22 9 34-29-19-29 19 9-34-26-22 34-2ZM60 29l8 22 23 1-18 15 6 23-19-13-19 13 6-23-18-15 23-1Z"
    },
    "eagles": {
        "signature": "Midnight wings",
        "lettering": "slant",
        "motif": "M12 90l96-66-23 43-57 29ZM27 78l58-35M40 83l53-32M56 82l31-19M15 104h75"
    },
    "patriots": {
        "signature": "New England pennant",
        "lettering": "serif",
        "motif": "M22 108V14l82 19-82 30M29 24l59 13-59 17M18 108h35M59 65l6 13 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2Z"
    },
    "chiefs": {
        "signature": "Arrowhead red",
        "lettering": "block",
        "motif": "M12 55l62-37 34 42-34 42-62-37 17-5ZM35 60l39-24 20 24-20 24ZM14 108h92"
    },
    "steelers": {
        "signature": "Forged Pittsburgh",
        "lettering": "block",
        "motif": "M16 20h88v84H16ZM16 38h88M38 20v84m44-84v84M16 82h88M38 38l44 44m0-44L38 82M25 29h1m68 0h1M25 94h1m68 0h1"
    },
    "rangers": {
        "signature": "Broadway shield",
        "lettering": "slant",
        "motif": "M21 16h78v55l-39 37-39-37ZM21 36h78M28 69l56-41M38 81l54-40M49 93l43-32M32 23h56"
    },
    "blackhawks": {
        "signature": "Chicago rink bands",
        "lettering": "block",
        "motif": "M17 17h86v86H17ZM17 38h86M17 82h86M31 38v44m58-44v44M45 53h30v15H45ZM53 103v9m14-9v9"
    },
    "penguins": {
        "signature": "Carbon & frozen gold",
        "lettering": "slant",
        "motif": "M60 12l48 88H12ZM60 29l32 58H28ZM60 49l15 27H45ZM18 108h84"
    },
    "bruins": {
        "signature": "Boston heritage rings",
        "lettering": "serif",
        "motif": "M60 12a48 48 0 1 1 0 96 48 48 0 1 1 0-96ZM60 24a36 36 0 1 1 0 72 36 36 0 1 1 0-72ZM60 12v25m0 46v25M12 60h25m46 0h25M26 26l18 18m32 32 18 18M26 94l18-18m32-32 18-18"
    },
    "maple-leafs": {
        "signature": "Winter engraving",
        "lettering": "serif",
        "motif": "M60 12l10 22 14-8-3 26 23-7-8 20 12 7-36 19 2 17H46l2-17-36-19 12-7-8-20 23 7-3-26 14 8ZM60 35v63M38 62l22 18 22-18"
    },
    "canadiens": {
        "signature": "Montreal tricolor",
        "lettering": "serif",
        "motif": "M16 96V43l44-25 44 25v53ZM16 57h88M16 81h88M29 43h62M38 57v24m22-24v24m22-24v24M25 106h70"
    }
};

export const DECK_CORE_THEMES = {
    "dark": "Midnight",
    "light": "Paper",
    "ocean": "Ocean",
    "forest": "Forest",
    "sunset": "Sunset"
};
