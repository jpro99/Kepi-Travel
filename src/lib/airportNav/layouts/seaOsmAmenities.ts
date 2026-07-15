/**
 * SEA named traveler amenities from OpenStreetMap (Overpass bbox extract 2026-07-15).
 * Exact OSM coordinates — precision:"surveyed". Generated, do not hand-edit coords.
 * Source: .git/osm_sea_fresh.json via extract_sea_amenities.mjs
 * Elevators/escalators omitted here (destination clutter); still promoted on OSM import.
 * ODbL: Map data © OpenStreetMap contributors.
 */

export interface SeaOsmAmenity {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** OSM element id for verify-first audits, e.g. way/700704097 */
  osm: string;
  kind: "food" | "shop" | "bank" | "charging" | "baggage" | "amenity";
}

export const SEA_OSM_AMENITIES: SeaOsmAmenity[] =
[
  {
    "id": "amenity-13-coins-3209330685",
    "name": "13 Coins",
    "lng": -122.2953761,
    "lat": 47.4412734,
    "kind": "food",
    "osm": "node/3209330685"
  },
  {
    "id": "amenity-alki-bakery-700704099",
    "name": "Alki Bakery",
    "lng": -122.3021839,
    "lat": 47.443284,
    "kind": "shop",
    "osm": "way/700704099"
  },
  {
    "id": "amenity-bad-egg-breakfast-bar-1037480328",
    "name": "Bad Egg Breakfast Bar",
    "lng": -122.3015798,
    "lat": 47.4482266,
    "kind": "food",
    "osm": "way/1037480328"
  },
  {
    "id": "amenity-bambuza-687883520",
    "name": "Bambuza",
    "lng": -122.303115,
    "lat": 47.4491622,
    "kind": "food",
    "osm": "way/687883520"
  },
  {
    "id": "amenity-beecher-s-handmade-cheese-11789336632",
    "name": "Beecher’s Handmade Cheese",
    "lng": -122.3030139,
    "lat": 47.4485505,
    "kind": "food",
    "osm": "node/11789336632"
  },
  {
    "id": "amenity-bite-society-13976551285",
    "name": "Bite Society",
    "lng": -122.3028291,
    "lat": 47.4446631,
    "kind": "shop",
    "osm": "node/13976551285"
  },
  {
    "id": "amenity-buffalo-wild-wings-go-13953189924",
    "name": "Buffalo Wild Wings Go",
    "lng": -122.3032165,
    "lat": 47.4449141,
    "kind": "food",
    "osm": "node/13953189924"
  },
  {
    "id": "amenity-caffe-d-arte-687883528",
    "name": "Caffe D'arte",
    "lng": -122.303497,
    "lat": 47.4490169,
    "kind": "food",
    "osm": "way/687883528"
  },
  {
    "id": "amenity-caffe-d-arte-3643290932",
    "name": "Caffe D'Arte",
    "lng": -122.2980848,
    "lat": 47.4400339,
    "kind": "food",
    "osm": "node/3643290932"
  },
  {
    "id": "amenity-caffe-vita-11789336631",
    "name": "Caffe Vita",
    "lng": -122.3029713,
    "lat": 47.4486076,
    "kind": "food",
    "osm": "node/11789336631"
  },
  {
    "id": "amenity-camden-food-co-700704144",
    "name": "Camden Food Co.",
    "lng": -122.3002292,
    "lat": 47.4458705,
    "kind": "food",
    "osm": "way/700704144"
  },
  {
    "id": "amenity-capitol-hill-food-hall-6551504954",
    "name": "Capitol Hill Food Hall",
    "lng": -122.2996402,
    "lat": 47.4410898,
    "kind": "food",
    "osm": "node/6551504954"
  },
  {
    "id": "amenity-chalo-co-11789336640",
    "name": "Chalo & Co",
    "lng": -122.3019651,
    "lat": 47.4482347,
    "kind": "shop",
    "osm": "node/11789336640"
  },
  {
    "id": "amenity-chili-s-13953189918",
    "name": "Chili's",
    "lng": -122.3030072,
    "lat": 47.4448384,
    "kind": "food",
    "osm": "node/13953189918"
  },
  {
    "id": "amenity-coach-688522627",
    "name": "Coach",
    "lng": -122.3029526,
    "lat": 47.4441082,
    "kind": "shop",
    "osm": "way/688522627"
  },
  {
    "id": "amenity-convenience-store-7656869486",
    "name": "Convenience Store",
    "lng": -122.3005206,
    "lat": 47.4422047,
    "kind": "food",
    "osm": "node/7656869486"
  },
  {
    "id": "amenity-costa-11789336633",
    "name": "Costa",
    "lng": -122.3026556,
    "lat": 47.4486466,
    "kind": "food",
    "osm": "node/11789336633"
  },
  {
    "id": "amenity-delta-skyclub-1037488212",
    "name": "Delta SkyClub",
    "lng": -122.3026536,
    "lat": 47.4425018,
    "kind": "food",
    "osm": "way/1037488212"
  },
  {
    "id": "amenity-denny-s-246328442",
    "name": "Denny's",
    "lng": -122.29602,
    "lat": 47.4487669,
    "kind": "food",
    "osm": "way/246328442"
  },
  {
    "id": "amenity-denny-s-314940623",
    "name": "Denny's",
    "lng": -122.2962698,
    "lat": 47.4357155,
    "kind": "food",
    "osm": "way/314940623"
  },
  {
    "id": "amenity-dilettante-mocha-caf-700704113",
    "name": "Dilettante Mocha Café",
    "lng": -122.3030829,
    "lat": 47.4437523,
    "kind": "food",
    "osm": "way/700704113"
  },
  {
    "id": "amenity-dufry-3643290935",
    "name": "Dufry",
    "lng": -122.297932,
    "lat": 47.4399353,
    "kind": "shop",
    "osm": "node/3643290935"
  },
  {
    "id": "amenity-dufry-duty-free-688101300",
    "name": "Dufry Duty Free",
    "lng": -122.3025494,
    "lat": 47.4385667,
    "kind": "shop",
    "osm": "way/688101300"
  },
  {
    "id": "amenity-dufry-duty-free-688522621",
    "name": "Dufry Duty Free",
    "lng": -122.3025283,
    "lat": 47.4441338,
    "kind": "shop",
    "osm": "way/688522621"
  },
  {
    "id": "amenity-embarque-1037480329",
    "name": "Embarque",
    "lng": -122.3017135,
    "lat": 47.4483301,
    "kind": "food",
    "osm": "way/1037480329"
  },
  {
    "id": "amenity-emerald-city-market-687883524",
    "name": "Emerald City Market",
    "lng": -122.3029795,
    "lat": 47.44913,
    "kind": "shop",
    "osm": "way/687883524"
  },
  {
    "id": "amenity-evergreens-700704108",
    "name": "Evergreens",
    "lng": -122.3033788,
    "lat": 47.4433759,
    "kind": "food",
    "osm": "way/700704108"
  },
  {
    "id": "amenity-evgo-1166223818",
    "name": "eVgo",
    "lng": -122.2995343,
    "lat": 47.4502375,
    "kind": "charging",
    "osm": "way/1166223818"
  },
  {
    "id": "amenity-filson-1037480343",
    "name": "FILSON",
    "lng": -122.3022906,
    "lat": 47.4486748,
    "kind": "shop",
    "osm": "way/1037480343"
  },
  {
    "id": "amenity-fireworks-700704124",
    "name": "Fireworks",
    "lng": -122.3028109,
    "lat": 47.44336,
    "kind": "shop",
    "osm": "way/700704124"
  },
  {
    "id": "amenity-fireworks-700704153",
    "name": "Fireworks",
    "lng": -122.2995857,
    "lat": 47.4460972,
    "kind": "shop",
    "osm": "way/700704153"
  },
  {
    "id": "amenity-floret-1037488211",
    "name": "Floret",
    "lng": -122.302218,
    "lat": 47.4426179,
    "kind": "food",
    "osm": "way/1037488211"
  },
  {
    "id": "amenity-food-mart-4320422000",
    "name": "Food Mart",
    "lng": -122.2953913,
    "lat": 47.4509737,
    "kind": "shop",
    "osm": "node/4320422000"
  },
  {
    "id": "amenity-food-mart-647569318",
    "name": "Food Mart",
    "lng": -122.2955996,
    "lat": 47.450399,
    "kind": "shop",
    "osm": "way/647569318"
  },
  {
    "id": "amenity-great-state-burger-13953189943",
    "name": "Great State Burger",
    "lng": -122.3033479,
    "lat": 47.4448071,
    "kind": "food",
    "osm": "node/13953189943"
  },
  {
    "id": "amenity-greedy-cow-burger-688101306",
    "name": "Greedy Cow Burger",
    "lng": -122.3017682,
    "lat": 47.4388367,
    "kind": "food",
    "osm": "way/688101306"
  },
  {
    "id": "amenity-hachi-ko-688522662",
    "name": "Hachi-ko",
    "lng": -122.3039689,
    "lat": 47.4458278,
    "kind": "food",
    "osm": "way/688522662"
  },
  {
    "id": "amenity-hudson-1037488217",
    "name": "Hudson",
    "lng": -122.3036157,
    "lat": 47.4417073,
    "kind": "shop",
    "osm": "way/1037488217"
  },
  {
    "id": "amenity-hudson-1037488222",
    "name": "Hudson",
    "lng": -122.3028741,
    "lat": 47.4429739,
    "kind": "shop",
    "osm": "way/1037488222"
  },
  {
    "id": "amenity-hudson-3643223205",
    "name": "Hudson",
    "lng": -122.29751,
    "lat": 47.4389664,
    "kind": "shop",
    "osm": "node/3643223205"
  },
  {
    "id": "amenity-hudson-3643290930",
    "name": "Hudson",
    "lng": -122.29791,
    "lat": 47.4402196,
    "kind": "shop",
    "osm": "node/3643290930"
  },
  {
    "id": "amenity-hudson-3643290931",
    "name": "Hudson",
    "lng": -122.300805,
    "lat": 47.441635,
    "kind": "shop",
    "osm": "node/3643290931"
  },
  {
    "id": "amenity-hudson-6721009655",
    "name": "Hudson",
    "lng": -122.299746,
    "lat": 47.4456321,
    "kind": "shop",
    "osm": "node/6721009655"
  },
  {
    "id": "amenity-hudson-688101303",
    "name": "Hudson",
    "lng": -122.3023341,
    "lat": 47.4388211,
    "kind": "shop",
    "osm": "way/688101303"
  },
  {
    "id": "amenity-hudson-688522632",
    "name": "Hudson",
    "lng": -122.3020762,
    "lat": 47.4444264,
    "kind": "shop",
    "osm": "way/688522632"
  },
  {
    "id": "amenity-hudson-688522655",
    "name": "Hudson",
    "lng": -122.3037379,
    "lat": 47.445522,
    "kind": "shop",
    "osm": "way/688522655"
  },
  {
    "id": "amenity-hudson-700704097",
    "name": "Hudson",
    "lng": -122.3022502,
    "lat": 47.4433784,
    "kind": "shop",
    "osm": "way/700704097"
  },
  {
    "id": "amenity-hudson-700704155",
    "name": "Hudson",
    "lng": -122.2997859,
    "lat": 47.445979,
    "kind": "shop",
    "osm": "way/700704155"
  },
  {
    "id": "amenity-hudson-nonstop-688522629",
    "name": "Hudson Nonstop",
    "lng": -122.3030966,
    "lat": 47.44421,
    "kind": "shop",
    "osm": "way/688522629"
  },
  {
    "id": "amenity-inmotion-5264172525",
    "name": "InMotion",
    "lng": -122.300012,
    "lat": 47.4411331,
    "kind": "shop",
    "osm": "node/5264172525"
  },
  {
    "id": "amenity-inmotion-700704154",
    "name": "InMotion",
    "lng": -122.299665,
    "lat": 47.4460768,
    "kind": "shop",
    "osm": "way/700704154"
  },
  {
    "id": "amenity-international-currency-exchange-5164272324",
    "name": "International Currency Exchange",
    "lng": -122.3007653,
    "lat": 47.4418691,
    "kind": "amenity",
    "osm": "node/5164272324"
  },
  {
    "id": "amenity-international-currency-exchange-5774282053",
    "name": "International Currency Exchange",
    "lng": -122.3026464,
    "lat": 47.4387722,
    "kind": "amenity",
    "osm": "node/5774282053"
  },
  {
    "id": "amenity-jack-in-the-box-276667048",
    "name": "Jack in the Box",
    "lng": -122.2961815,
    "lat": 47.4349458,
    "kind": "food",
    "osm": "way/276667048"
  },
  {
    "id": "amenity-kathy-casey-dish-d-lish-688522660",
    "name": "Kathy Casey Dish D'Lish",
    "lng": -122.3037476,
    "lat": 47.445915,
    "kind": "shop",
    "osm": "way/688522660"
  },
  {
    "id": "amenity-koi-shi-700704115",
    "name": "Koi Shi",
    "lng": -122.3033716,
    "lat": 47.4435434,
    "kind": "food",
    "osm": "way/700704115"
  },
  {
    "id": "amenity-l-l-hawaiian-barbecue-8008332116",
    "name": "L&L Hawaiian Barbecue",
    "lng": -122.295993,
    "lat": 47.436692,
    "kind": "food",
    "osm": "node/8008332116"
  },
  {
    "id": "amenity-lady-yum-5264172521",
    "name": "Lady Yum",
    "lng": -122.302201,
    "lat": 47.4427848,
    "kind": "shop",
    "osm": "node/5264172521"
  },
  {
    "id": "amenity-le-grand-comptoir-688522657",
    "name": "Le Grand Comptoir",
    "lng": -122.3037401,
    "lat": 47.4457019,
    "kind": "food",
    "osm": "way/688522657"
  },
  {
    "id": "amenity-lil-woody-s-9597290574",
    "name": "Lil Woody’s",
    "lng": -122.3018294,
    "lat": 47.4480384,
    "kind": "food",
    "osm": "node/9597290574"
  },
  {
    "id": "amenity-liquor-wine-seatac-5777099653",
    "name": "Liquor & Wine SeaTac",
    "lng": -122.2960032,
    "lat": 47.4360202,
    "kind": "shop",
    "osm": "node/5777099653"
  },
  {
    "id": "amenity-loulou-market-and-bar-1037488213",
    "name": "LouLou Market and Bar",
    "lng": -122.3033754,
    "lat": 47.4422966,
    "kind": "food",
    "osm": "way/1037488213"
  },
  {
    "id": "amenity-lowrider-cookie-company-5264150423",
    "name": "Lowrider Cookie Company",
    "lng": -122.302106,
    "lat": 47.4427203,
    "kind": "shop",
    "osm": "node/5264150423"
  },
  {
    "id": "amenity-lucky-louie-fish-shack-700704105",
    "name": "Lucky Louie Fish Shack",
    "lng": -122.3031598,
    "lat": 47.4432531,
    "kind": "food",
    "osm": "way/700704105"
  },
  {
    "id": "amenity-mac-cosmetics-688522626",
    "name": "MAC Cosmetics",
    "lng": -122.3030592,
    "lat": 47.4440916,
    "kind": "shop",
    "osm": "way/688522626"
  },
  {
    "id": "amenity-made-in-washington-700704123",
    "name": "Made in Washington",
    "lng": -122.3027268,
    "lat": 47.4432728,
    "kind": "shop",
    "osm": "way/700704123"
  },
  {
    "id": "amenity-manchu-wok-3643290933",
    "name": "Manchu Wok",
    "lng": -122.3000807,
    "lat": 47.4411819,
    "kind": "food",
    "osm": "node/3643290933"
  },
  {
    "id": "amenity-mango-thai-3209330684",
    "name": "Mango Thai",
    "lng": -122.295961,
    "lat": 47.4362917,
    "kind": "food",
    "osm": "node/3209330684"
  },
  {
    "id": "amenity-marmot-1037488210",
    "name": "Marmot",
    "lng": -122.3025279,
    "lat": 47.4428108,
    "kind": "shop",
    "osm": "way/1037488210"
  },
  {
    "id": "amenity-mcdonald-s-1037488208",
    "name": "McDonald's",
    "lng": -122.3028352,
    "lat": 47.4426634,
    "kind": "food",
    "osm": "way/1037488208"
  },
  {
    "id": "amenity-mi-casa-cantina-1037488220",
    "name": "Mi Casa Cantina",
    "lng": -122.3036515,
    "lat": 47.4413258,
    "kind": "food",
    "osm": "way/1037488220"
  },
  {
    "id": "amenity-moe-s-indian-kitchen-688101305",
    "name": "Moe's Indian Kitchen",
    "lng": -122.3018083,
    "lat": 47.4388852,
    "kind": "food",
    "osm": "way/688101305"
  },
  {
    "id": "amenity-nanny-s-bbq-13976556413",
    "name": "Nanny's BBQ",
    "lng": -122.3029643,
    "lat": 47.4447981,
    "kind": "food",
    "osm": "node/13976556413"
  },
  {
    "id": "amenity-natalie-s-candy-jar-11789336638",
    "name": "Natalie’s Candy Jar",
    "lng": -122.3024948,
    "lat": 47.448736,
    "kind": "shop",
    "osm": "node/11789336638"
  },
  {
    "id": "amenity-neighborhood-bubble-tea-and-coffee-700704146",
    "name": "Neighborhood Bubble Tea and Coffee",
    "lng": -122.299868,
    "lat": 47.4456081,
    "kind": "food",
    "osm": "way/700704146"
  },
  {
    "id": "amenity-ninth-pike-artisan-kitchen-688522653",
    "name": "Ninth & Pike Artisan Kitchen",
    "lng": -122.3037529,
    "lat": 47.4451767,
    "kind": "food",
    "osm": "way/688522653"
  },
  {
    "id": "amenity-open-space-tap-room-11789336637",
    "name": "Open Space Tap Room",
    "lng": -122.3028511,
    "lat": 47.4484835,
    "kind": "food",
    "osm": "node/11789336637"
  },
  {
    "id": "amenity-p-f-chang-s-13630053295",
    "name": "P.F. Chang's",
    "lng": -122.3030423,
    "lat": 47.4485884,
    "kind": "food",
    "osm": "node/13630053295"
  },
  {
    "id": "amenity-pallino-700704107",
    "name": "Pallino",
    "lng": -122.3033052,
    "lat": 47.4433664,
    "kind": "food",
    "osm": "way/700704107"
  },
  {
    "id": "amenity-peet-s-coffee-688101307",
    "name": "Peet's Coffee",
    "lng": -122.3018694,
    "lat": 47.4389335,
    "kind": "food",
    "osm": "way/688101307"
  },
  {
    "id": "amenity-pei-wei-700704106",
    "name": "Pei Wei",
    "lng": -122.303212,
    "lat": 47.443349,
    "kind": "food",
    "osm": "way/700704106"
  },
  {
    "id": "amenity-pike-and-pine-1037480330",
    "name": "Pike and Pine",
    "lng": -122.3018369,
    "lat": 47.4484129,
    "kind": "shop",
    "osm": "way/1037480330"
  },
  {
    "id": "amenity-planewear-688522614",
    "name": "Planewear",
    "lng": -122.3028113,
    "lat": 47.4438702,
    "kind": "shop",
    "osm": "way/688522614"
  },
  {
    "id": "amenity-planewear-688522635",
    "name": "Planewear",
    "lng": -122.3024427,
    "lat": 47.4444652,
    "kind": "shop",
    "osm": "way/688522635"
  },
  {
    "id": "amenity-port-of-subs-13953189942",
    "name": "Port of Subs",
    "lng": -122.303315,
    "lat": 47.4448234,
    "kind": "food",
    "osm": "node/13953189942"
  },
  {
    "id": "amenity-qdoba-700704101",
    "name": "Qdoba",
    "lng": -122.3023702,
    "lat": 47.4430413,
    "kind": "food",
    "osm": "way/700704101"
  },
  {
    "id": "amenity-rbg-bar-grill-12474229118",
    "name": "RBG Bar & Grill",
    "lng": -122.2950914,
    "lat": 47.4405047,
    "kind": "food",
    "osm": "node/12474229118"
  },
  {
    "id": "amenity-salty-s-at-the-sea-700704111",
    "name": "Salty’s at the Sea",
    "lng": -122.3031954,
    "lat": 47.4439254,
    "kind": "food",
    "osm": "way/700704111"
  },
  {
    "id": "amenity-sam-choy-s-poke-to-the-max-1037486110",
    "name": "Sam Choy’s Poke to the Max",
    "lng": -122.3000128,
    "lat": 47.4460227,
    "kind": "food",
    "osm": "way/1037486110"
  },
  {
    "id": "amenity-sea-pop-culture-11789336635",
    "name": "SEA Pop Culture",
    "lng": -122.3024251,
    "lat": 47.4486999,
    "kind": "shop",
    "osm": "node/11789336635"
  },
  {
    "id": "amenity-seatac-nails-4907698351",
    "name": "SeaTac Nails",
    "lng": -122.295987,
    "lat": 47.4367659,
    "kind": "shop",
    "osm": "node/4907698351"
  },
  {
    "id": "amenity-seattle-chocolate-688522628",
    "name": "Seattle Chocolate",
    "lng": -122.3030296,
    "lat": 47.4441743,
    "kind": "shop",
    "osm": "way/688522628"
  },
  {
    "id": "amenity-seattle-glassblowing-studio-13976551288",
    "name": "Seattle Glassblowing Studio",
    "lng": -122.3032936,
    "lat": 47.4447114,
    "kind": "shop",
    "osm": "node/13976551288"
  },
  {
    "id": "amenity-sharps-roasthouse-150750085",
    "name": "Sharps Roasthouse",
    "lng": -122.2961769,
    "lat": 47.4372216,
    "kind": "food",
    "osm": "way/150750085"
  },
  {
    "id": "amenity-show-pony-11789336644",
    "name": "Show Pony",
    "lng": -122.3017167,
    "lat": 47.448098,
    "kind": "shop",
    "osm": "node/11789336644"
  },
  {
    "id": "amenity-skillet-687883521",
    "name": "Skillet",
    "lng": -122.3031397,
    "lat": 47.4492266,
    "kind": "food",
    "osm": "way/687883521"
  },
  {
    "id": "amenity-skillet-688522654",
    "name": "Skillet",
    "lng": -122.3037476,
    "lat": 47.4454515,
    "kind": "food",
    "osm": "way/688522654"
  },
  {
    "id": "amenity-smith-cove-bar-kitchen-688101301",
    "name": "Smith Cove Bar & Kitchen",
    "lng": -122.3021536,
    "lat": 47.4388337,
    "kind": "food",
    "osm": "way/688101301"
  },
  {
    "id": "amenity-sourced-market-1037486346",
    "name": "Sourced Market",
    "lng": -122.3022001,
    "lat": 47.4438987,
    "kind": "shop",
    "osm": "way/1037486346"
  },
  {
    "id": "amenity-starbucks-1037488216",
    "name": "Starbucks",
    "lng": -122.3036151,
    "lat": 47.4417979,
    "kind": "food",
    "osm": "way/1037488216"
  },
  {
    "id": "amenity-starbucks-2554523052",
    "name": "Starbucks",
    "lng": -122.3009614,
    "lat": 47.4417426,
    "kind": "food",
    "osm": "node/2554523052"
  },
  {
    "id": "amenity-starbucks-688522620",
    "name": "Starbucks",
    "lng": -122.3024937,
    "lat": 47.4439798,
    "kind": "food",
    "osm": "way/688522620"
  },
  {
    "id": "amenity-starbucks-688522658",
    "name": "Starbucks",
    "lng": -122.3037494,
    "lat": 47.4458444,
    "kind": "food",
    "osm": "way/688522658"
  },
  {
    "id": "amenity-starbucks-700704104",
    "name": "Starbucks",
    "lng": -122.3030123,
    "lat": 47.4431316,
    "kind": "food",
    "osm": "way/700704104"
  },
  {
    "id": "amenity-starbucks-700704143",
    "name": "Starbucks",
    "lng": -122.3012271,
    "lat": 47.4452175,
    "kind": "food",
    "osm": "way/700704143"
  },
  {
    "id": "amenity-stonehouse-688522636",
    "name": "Stonehouse",
    "lng": -122.3025911,
    "lat": 47.444352,
    "kind": "food",
    "osm": "way/688522636"
  },
  {
    "id": "amenity-subway-4907698350",
    "name": "Subway",
    "lng": -122.2959788,
    "lat": 47.4368552,
    "kind": "food",
    "osm": "node/4907698350"
  },
  {
    "id": "amenity-sunglass-hut-13866989295",
    "name": "Sunglass Hut",
    "lng": -122.3037799,
    "lat": 47.4450126,
    "kind": "shop",
    "osm": "node/13866989295"
  },
  {
    "id": "amenity-swarovski-6039202387",
    "name": "Swarovski",
    "lng": -122.2997656,
    "lat": 47.4411829,
    "kind": "shop",
    "osm": "node/6039202387"
  },
  {
    "id": "amenity-talking-fountain-8920167700",
    "name": "Talking Fountain",
    "lng": -122.3040361,
    "lat": 47.4460108,
    "kind": "amenity",
    "osm": "node/8920167700"
  },
  {
    "id": "amenity-tender-loving-empire-11789336634",
    "name": "Tender Loving Empire",
    "lng": -122.3025788,
    "lat": 47.448772,
    "kind": "shop",
    "osm": "node/11789336634"
  },
  {
    "id": "amenity-terminal-getaway-spa-5264172524",
    "name": "Terminal Getaway Spa",
    "lng": -122.3001798,
    "lat": 47.441259,
    "kind": "shop",
    "osm": "node/5264172524"
  },
  {
    "id": "amenity-the-confectionary-10930927601",
    "name": "The Confectionary",
    "lng": -122.3021294,
    "lat": 47.4427312,
    "kind": "shop",
    "osm": "node/10930927601"
  },
  {
    "id": "amenity-the-hop-over-11413517402",
    "name": "The Hop Over",
    "lng": -122.3039728,
    "lat": 47.4452493,
    "kind": "food",
    "osm": "node/11413517402"
  },
  {
    "id": "amenity-transcend-13976551286",
    "name": "Transcend",
    "lng": -122.3031293,
    "lat": 47.4446299,
    "kind": "shop",
    "osm": "node/13976551286"
  },
  {
    "id": "amenity-tumi-1037488209",
    "name": "Tumi",
    "lng": -122.3026621,
    "lat": 47.4427818,
    "kind": "shop",
    "osm": "way/1037488209"
  },
  {
    "id": "amenity-tundra-taqueria-1037480353",
    "name": "Tundra Taqueria",
    "lng": -122.3028538,
    "lat": 47.4484263,
    "kind": "food",
    "osm": "way/1037480353"
  },
  {
    "id": "amenity-u-s-bank-10046446332",
    "name": "U.S. Bank",
    "lng": -122.302303,
    "lat": 47.4484291,
    "kind": "bank",
    "osm": "node/10046446332"
  },
  {
    "id": "amenity-u-s-bank-11593934583",
    "name": "U.S. Bank",
    "lng": -122.3019688,
    "lat": 47.4444795,
    "kind": "bank",
    "osm": "node/11593934583"
  },
  {
    "id": "amenity-u-s-bank-11593934584",
    "name": "U.S. Bank",
    "lng": -122.3012863,
    "lat": 47.4443095,
    "kind": "bank",
    "osm": "node/11593934584"
  },
  {
    "id": "amenity-u-s-bank-4334772796",
    "name": "U.S. Bank",
    "lng": -122.302623,
    "lat": 47.4441387,
    "kind": "bank",
    "osm": "node/4334772796"
  },
  {
    "id": "amenity-u-s-bank-4352748664",
    "name": "U.S. Bank",
    "lng": -122.301088,
    "lat": 47.4452518,
    "kind": "bank",
    "osm": "node/4352748664"
  },
  {
    "id": "amenity-u-s-bank-4378939903",
    "name": "U.S. Bank",
    "lng": -122.3016,
    "lat": 47.4388116,
    "kind": "bank",
    "osm": "node/4378939903"
  },
  {
    "id": "amenity-u-s-bank-4405597090",
    "name": "U.S. Bank",
    "lng": -122.299299,
    "lat": 47.4462054,
    "kind": "bank",
    "osm": "node/4405597090"
  },
  {
    "id": "amenity-u-s-bank-5164232126",
    "name": "U.S. Bank",
    "lng": -122.297528,
    "lat": 47.4388546,
    "kind": "bank",
    "osm": "node/5164232126"
  },
  {
    "id": "amenity-u-s-bank-5164276921",
    "name": "U.S. Bank",
    "lng": -122.30036,
    "lat": 47.4415999,
    "kind": "bank",
    "osm": "node/5164276921"
  },
  {
    "id": "amenity-u-s-bank-5164278021",
    "name": "U.S. Bank",
    "lng": -122.297779,
    "lat": 47.4401292,
    "kind": "bank",
    "osm": "node/5164278021"
  },
  {
    "id": "amenity-u-s-bank-5357406223",
    "name": "U.S. Bank",
    "lng": -122.3031531,
    "lat": 47.442532,
    "kind": "bank",
    "osm": "node/5357406223"
  },
  {
    "id": "amenity-u-s-bank-6551337254",
    "name": "U.S. Bank",
    "lng": -122.301807,
    "lat": 47.4436102,
    "kind": "bank",
    "osm": "node/6551337254"
  },
  {
    "id": "amenity-u-s-bank-6566489493",
    "name": "U.S. Bank",
    "lng": -122.302648,
    "lat": 47.4431284,
    "kind": "bank",
    "osm": "node/6566489493"
  },
  {
    "id": "amenity-urban-market-700704142",
    "name": "Urban Market",
    "lng": -122.3011565,
    "lat": 47.4452657,
    "kind": "shop",
    "osm": "way/700704142"
  },
  {
    "id": "amenity-vyne-700704103",
    "name": "Vyne",
    "lng": -122.302969,
    "lat": 47.4430558,
    "kind": "food",
    "osm": "way/700704103"
  },
  {
    "id": "amenity-wanderlust-13976551287",
    "name": "Wanderlust",
    "lng": -122.303216,
    "lat": 47.4446745,
    "kind": "food",
    "osm": "node/13976551287"
  },
  {
    "id": "amenity-wendy-s-11789336636",
    "name": "Wendy’s",
    "lng": -122.3028664,
    "lat": 47.4486952,
    "kind": "food",
    "osm": "node/11789336636"
  }
];
