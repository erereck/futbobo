import { RANDOM_NAME_FIRST_PART, RANDOM_NAME_LAST_PART } from "./state";

// Expansão global do gerador de nomes. Mantemos o gerador legado intacto e
// apenas enriquecemos os dois pools em runtime, preservando saves e seeds.

const ENGLISH_FIRST = [
  "Aaron", "Adam", "Adrian", "Aidan", "Alex", "Alfie", "Andrew", "Anthony", "Archie", "Arthur",
  "Ashton", "Austin", "Benjamin", "Blake", "Bradley", "Brandon", "Caleb", "Callum", "Cameron", "Charlie",
  "Christopher", "Connor", "Corey", "Daniel", "Danny", "Darren", "David", "Declan", "Dominic", "Dylan",
  "Edward", "Elliot", "Ellis", "Ethan", "Evan", "Finley", "Finn", "Freddie", "George", "Harley",
  "Harrison", "Harry", "Harvey", "Henry", "Isaac", "Jack", "Jacob", "Jake", "James", "Jamie",
  "Jayden", "Joel", "John", "Jonathan", "Jordan", "Joseph", "Josh", "Joshua", "Jude", "Julian",
  "Kai", "Kyle", "Leo", "Lewis", "Liam", "Logan", "Louis", "Luke", "Mason", "Matthew",
  "Max", "Michael", "Nathan", "Nathaniel", "Nicholas", "Oliver", "Oscar", "Owen", "Reece", "Rhys",
  "Robert", "Rory", "Ryan", "Samuel", "Scott", "Sean", "Sebastian", "Theo", "Thomas", "Tom",
  "Tommy", "Tyler", "William", "Zachary", "Zach", "Reuben", "Kieran", "Curtis", "Dean", "Mitchell",
];

const BRAZIL_FIRST = [
  "João", "Pedro", "Lucas", "Gabriel", "Matheus", "Rafael", "Felipe", "Bruno", "Caio", "Gustavo",
  "Henrique", "Leonardo", "Luiz", "André", "Rodrigo", "Renan", "Murilo", "Danilo", "Diego", "Douglas",
  "Eduardo", "Fernando", "Francisco", "Guilherme", "Igor", "Jeferson", "Jonathan", "José", "Luan", "Marcelo",
  "Marcos", "Maurício", "Paulo", "Ramon", "Renato", "Ricardo", "Roberto", "Rodrigo", "Samuel", "Thales",
  "Victor", "Vinícius", "Wanderson", "Wallace", "William", "Anderson", "Alexandre", "Alan", "Alisson", "Ângelo",
  "Arthur", "Augusto", "Bernardo", "Carlos", "Cauã", "Christian", "Darlan", "Denílson", "Ederson", "Emerson",
  "Everton", "Fábio", "Fagner", "Geovane", "Heitor", "Hugo", "Jean", "Joanderson", "Kelvin", "Leandro",
  "Maicon", "Marlon", "Michel", "Nathan", "Pablo", "Patrick", "Riquelme", "Ruan", "Tácio", "Tiago",
  "Vagner", "Vanderson", "Wendel", "Yago", "Ygor", "Adriel", "Breno", "Cássio", "Dênis", "Everton",
];

const HISPANIC_FIRST = [
  "Alejandro", "Álvaro", "Andrés", "Ángel", "Antonio", "Bruno", "Carlos", "Cristian", "Damián", "Diego",
  "Eduardo", "Emiliano", "Facundo", "Federico", "Fernando", "Franco", "Gonzalo", "Guillermo", "Ignacio", "Iker",
  "Javier", "Joaquín", "Jorge", "José", "Juan", "Julián", "Lautaro", "Manuel", "Marco", "Marcos",
  "Martín", "Mateo", "Matías", "Miguel", "Nahuel", "Nicolás", "Pablo", "Ramiro", "Rodrigo", "Santiago",
  "Sergio", "Tomás", "Valentín", "Vicente", "Agustín", "Benjamín", "Cristóbal", "Ezequiel", "Gael", "Leandro",
];

const FRENCH_FIRST = [
  "Adrien", "Alexandre", "Antoine", "Aurélien", "Baptiste", "Benjamin", "Clément", "Corentin", "Damien", "Enzo",
  "Étienne", "Florian", "Hugo", "Jean", "Jules", "Julien", "Kylian", "Loïc", "Lucas", "Mathéo",
  "Mathieu", "Maxence", "Maxime", "Nolan", "Olivier", "Paul", "Pierre", "Raphaël", "Romain", "Sacha",
  "Théo", "Thomas", "Valentin", "Yanis", "Yohan", "Malo", "Noé", "Lilian", "Axel", "Gaëtan",
];

const ITALIAN_FIRST = [
  "Alessandro", "Alessio", "Andrea", "Angelo", "Antonio", "Christian", "Daniele", "Davide", "Domenico", "Edoardo",
  "Elia", "Emanuele", "Fabio", "Federico", "Filippo", "Francesco", "Gabriele", "Giacomo", "Gianluca", "Giorgio",
  "Giovanni", "Giulio", "Lorenzo", "Luca", "Marco", "Matteo", "Mattia", "Michele", "Niccolò", "Paolo",
  "Pietro", "Riccardo", "Roberto", "Salvatore", "Simone", "Stefano", "Tommaso", "Vincenzo", "Samuele", "Leonardo",
];

const GERMAN_DUTCH_FIRST = [
  "Alexander", "Anton", "Bastian", "Benedikt", "Benjamin", "Björn", "Christian", "Christoph", "Daniel", "Dennis",
  "Dominik", "Felix", "Florian", "Franz", "Frederik", "Fritz", "Hannes", "Jan", "Jonas", "Julian",
  "Kai", "Kevin", "Lars", "Leon", "Lukas", "Marco", "Marcel", "Mario", "Maximilian", "Moritz",
  "Niklas", "Nils", "Pascal", "Patrick", "Philipp", "Sebastian", "Simon", "Timo", "Tobias", "Yannick",
  "Bram", "Daan", "Jeroen", "Jesse", "Joost", "Luuk", "Mats", "Mees", "Ruben", "Sven",
];

const NORDIC_FIRST = [
  "Aksel", "Anders", "Andreas", "Aron", "Birk", "Emil", "Erik", "Espen", "Filip", "Frederik",
  "Gustav", "Henrik", "Isak", "Jens", "Jesper", "Jonas", "Kasper", "Kristian", "Lasse", "Magnus",
  "Marius", "Martin", "Mathias", "Mikkel", "Nikolaj", "Oskar", "Rasmus", "Sander", "Sindre", "Stian",
  "Søren", "Tobias", "Viktor", "William", "Elias", "Albin", "Linus", "Pontus", "Viggo", "Håkon",
];

const SLAVIC_BALKAN_FIRST = [
  "Aleksandar", "Aleksandr", "Andrej", "Andriy", "Ante", "Bojan", "Boris", "Branko", "Damir", "Dejan",
  "Dmytro", "Dominik", "Dragan", "Filip", "Goran", "Ivan", "Jakub", "Jan", "Josip", "Kamil",
  "Karol", "Luka", "Marcin", "Marko", "Matej", "Mateusz", "Milan", "Miloš", "Miroslav", "Nikola",
  "Ognjen", "Oleksandr", "Pavel", "Petar", "Piotr", "Radek", "Robert", "Slavko", "Stefan", "Tomasz",
  "Václav", "Viktor", "Vladimir", "Zoran", "Đorđe", "Lukáš", "Ondřej", "Patrik", "Marek", "Krzysztof",
];

const EAST_ASIAN_FIRST = [
  "Aoi", "Daichi", "Daiki", "Haruki", "Haruto", "Hayato", "Hikaru", "Hiroki", "Hiroto", "Itsuki",
  "Kaito", "Kazuki", "Keisuke", "Kenta", "Koji", "Makoto", "Naoki", "Ren", "Riku", "Ryota",
  "Shota", "Sota", "Takumi", "Taro", "Yuki", "Yuma", "Yuto", "Min-jun", "Ji-hoon", "Hyun-woo",
  "Seung-ho", "Joon-ho", "Dong-hyun", "Tae-yang", "Jun-seo", "Wei", "Hao", "Jun", "Tao", "Yichen",
  "Jian", "Ming", "Lei", "Bo", "Chen", "Long", "Zhen", "Kaiwen", "Yuto", "Ryo",
];

const AFRICAN_ARABIC_FIRST = [
  "Abdoulaye", "Adama", "Ahmed", "Ali", "Amadou", "Amin", "Ayoub", "Bilal", "Boubacar", "Cheick",
  "Demba", "Eliesse", "Fares", "Hakim", "Hamza", "Hassan", "Hicham", "Idrissa", "Ilyas", "Ismaël",
  "Karim", "Khalid", "Mahamadou", "Mahmoud", "Moussa", "Mustapha", "Nabil", "Nasser", "Omar", "Ousmane",
  "Rachid", "Riyad", "Sadio", "Said", "Salim", "Samba", "Souleymane", "Tariq", "Yacine", "Youssef",
  "Abdul", "Samuel", "Kwame", "Kofi", "Chinedu", "Emeka", "Ifeanyi", "Tunde", "Siyabonga", "Thabo",
  "Lebo", "Sipho", "Themba", "Kabelo", "Percy", "Victor", "Wilfred", "Calvin", "Mohammed", "Zakaria",
];

const ENGLISH_LAST = [
  "Abbott", "Adams", "Alexander", "Allen", "Anderson", "Andrews", "Armstrong", "Atkinson", "Bailey", "Baker",
  "Baldwin", "Barker", "Barnes", "Barrett", "Barton", "Bell", "Bennett", "Berry", "Black", "Blake",
  "Booth", "Bradley", "Brooks", "Brown", "Bryant", "Burke", "Burns", "Butler", "Campbell", "Carter",
  "Chapman", "Clark", "Clarke", "Cole", "Collins", "Cook", "Cooper", "Cox", "Davies", "Davis",
  "Dawson", "Dean", "Dixon", "Douglas", "Doyle", "Duncan", "Edwards", "Elliott", "Ellis", "Evans",
  "Fisher", "Fletcher", "Ford", "Foster", "Fox", "Fraser", "Gardner", "Gibson", "Graham", "Grant",
  "Gray", "Green", "Griffiths", "Hall", "Hamilton", "Harris", "Harrison", "Harvey", "Henderson", "Hill",
  "Holmes", "Howard", "Hudson", "Hughes", "Hunter", "Jackson", "James", "Jenkins", "Johnson", "Jones",
  "Kelly", "Kennedy", "King", "Knight", "Lawrence", "Lee", "Lewis", "Lloyd", "Marshall", "Martin",
  "Mason", "Matthews", "Miller", "Mitchell", "Moore", "Morgan", "Morris", "Morrison", "Murphy", "Murray",
  "Nelson", "Nicholson", "Noble", "Palmer", "Parker", "Pearson", "Phillips", "Powell", "Price", "Reed",
  "Reid", "Reynolds", "Richards", "Richardson", "Roberts", "Robertson", "Robinson", "Rogers", "Rose", "Ross",
  "Russell", "Scott", "Shaw", "Simpson", "Smith", "Spencer", "Stevens", "Stewart", "Taylor", "Thomas",
  "Thompson", "Turner", "Walker", "Ward", "Watson", "Webb", "White", "Wilkinson", "Williams", "Wilson",
  "Wood", "Wright", "Young", "Coleman", "Walsh", "O'Brien", "McCarthy", "McDonald", "McKenzie", "McLean",
  "McGregor", "McKay", "McKenna", "MacLeod", "Ferguson", "Gallagher", "Maguire", "Sullivan", "Duffy", "Rooney",
];

const BRAZIL_LAST = [
  "Silva", "Santos", "Oliveira", "Souza", "Sousa", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento",
  "Lima", "Araújo", "Fernandes", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro",
  "Mendes", "Barros", "Freitas", "Barbosa", "Pinto", "Moura", "Cavalcante", "Cardoso", "Teixeira", "Correia",
  "Vieira", "Moreira", "Castro", "Melo", "Azevedo", "Macedo", "Farias", "Campos", "Andrade", "Rezende",
  "Tavares", "Nunes", "Medeiros", "Borges", "Batista", "Miranda", "Duarte", "Coelho", "Assis", "Fonseca",
  "Paiva", "Ramos", "Machado", "Morais", "Moraes", "Neves", "Guimarães", "Bezerra", "Viana", "Brito",
  "Cunha", "Pacheco", "Queiroz", "Amorim", "Peixoto", "Aguiar", "Magalhães", "Xavier", "Siqueira", "Sales",
  "Leite", "Lopes", "Figueiredo", "Cabral", "Coutinho", "Mota", "Prado", "Vasconcelos", "Lacerda", "Menezes",
  "Bastos", "Rangel", "Diniz", "Galvão", "Matos", "Porto", "Varela", "Valente", "César", "Maranhão",
  "Bahia", "Paraíba", "Pernambuco", "Paulista", "Carioca", "Mineiro", "Gaúcho", "Ceará", "Capixaba", "Paraná",
];

const HISPANIC_LAST = [
  "Acosta", "Aguilar", "Alonso", "Álvarez", "Arias", "Benítez", "Blanco", "Bravo", "Cabrera", "Campos",
  "Cárdenas", "Carrasco", "Castillo", "Castro", "Contreras", "Córdoba", "Correa", "Cruz", "Delgado", "Díaz",
  "Domínguez", "Escobar", "Espinoza", "Fernández", "Flores", "Fuentes", "García", "Giménez", "Gómez", "González",
  "Gutiérrez", "Herrera", "Ibarra", "Jiménez", "Ledesma", "López", "Martínez", "Medina", "Mendoza", "Molina",
  "Morales", "Moreno", "Muñoz", "Navarro", "Núñez", "Ortega", "Ortiz", "Paredes", "Paz", "Pérez",
  "Ramírez", "Reyes", "Ríos", "Rivera", "Rodríguez", "Romero", "Ruiz", "Salazar", "Sánchez", "Suárez",
  "Torres", "Valdez", "Valencia", "Vargas", "Vega", "Véliz", "Villalba", "Zambrano", "Zapata", "Zárate",
  "Acevedo", "Arce", "Bustos", "Godoy", "Mancilla", "Orellana", "Quiroga", "Sosa", "Tapia", "Vidal",
];

const FRENCH_LAST = [
  "Bernard", "Bertrand", "Blanc", "Bonnet", "Boucher", "Boyer", "Brun", "Caron", "Chevalier", "Clement",
  "Colin", "David", "Dubois", "Dufour", "Dumas", "Dupont", "Durand", "Faure", "Fournier", "Garcia",
  "Garnier", "Gauthier", "Girard", "Giraud", "Guerin", "Henry", "Lambert", "Laurent", "Lefebvre", "Legrand",
  "Lemaire", "Leroy", "Marchand", "Martin", "Masson", "Mercier", "Michel", "Moreau", "Muller", "Nicolas",
  "Perrin", "Petit", "Philippe", "Renaud", "Richard", "Robin", "Roche", "Rousseau", "Roux", "Simon",
];

const ITALIAN_LAST = [
  "Amato", "Barbieri", "Basile", "Bellini", "Benedetti", "Bernardi", "Bianchi", "Bruno", "Caruso", "Colombo",
  "Conti", "Costa", "De Angelis", "De Luca", "De Santis", "Esposito", "Fabbri", "Farina", "Ferrara", "Ferrari",
  "Fontana", "Galli", "Gallo", "Gentile", "Giordano", "Greco", "Grimaldi", "Leone", "Lombardi", "Longo",
  "Mancini", "Marchetti", "Marino", "Martini", "Mazza", "Moretti", "Neri", "Orlando", "Palmieri", "Parisi",
  "Pellegrini", "Rinaldi", "Ricci", "Rizzo", "Romano", "Rossetti", "Russo", "Santoro", "Serra", "Villa",
];

const GERMAN_DUTCH_LAST = [
  "Bauer", "Baumann", "Becker", "Berger", "Bergmann", "Braun", "Brandt", "Busch", "Dietrich", "Engel",
  "Fischer", "Frank", "Friedrich", "Fuchs", "Graf", "Groß", "Günther", "Hahn", "Hartmann", "Herrmann",
  "Hoffmann", "Huber", "Jäger", "Kaiser", "Keller", "Klein", "Koch", "Köhler", "König", "Krause",
  "Krüger", "Lang", "Lehmann", "Lorenz", "Maier", "Mayer", "Meier", "Meyer", "Müller", "Neumann",
  "Otto", "Peters", "Richter", "Roth", "Sauer", "Schäfer", "Schmidt", "Schneider", "Scholz", "Schreiber",
  "Schröder", "Schubert", "Schulz", "Schwarz", "Vogel", "Wagner", "Weber", "Werner", "Wolf", "Zimmermann",
  "Bakker", "Bos", "Dijkstra", "De Boer", "De Jong", "De Vries", "Dekker", "Jansen", "Kok", "Mulder",
  "Smit", "Visser", "Van Beek", "Van Dam", "Van den Berg", "Van der Meer", "Van Dijk", "Van Leeuwen", "Vermeer", "Vos",
];

const NORDIC_LAST = [
  "Andersen", "Andersson", "Berg", "Bergström", "Christensen", "Dahl", "Eriksen", "Eriksson", "Hansen", "Hansson",
  "Henriksen", "Holm", "Johansen", "Johansson", "Jørgensen", "Karlsson", "Kristensen", "Larsson", "Lindberg", "Lund",
  "Madsen", "Magnusson", "Nielsen", "Nilsson", "Olsen", "Olsson", "Pedersen", "Persson", "Petersen", "Rasmussen",
  "Sandberg", "Svensson", "Sørensen", "Thomsen", "Björk", "Einarsson", "Gunnarsson", "Hauksson", "Jónsson", "Sigurðsson",
  "Aas", "Bakke", "Hagen", "Haugen", "Solberg", "Strand", "Larsen", "Nygård", "Moen", "Brekke",
];

const SLAVIC_BALKAN_LAST = [
  "Babić", "Bilić", "Božić", "Dimitrov", "Đorđević", "Horvat", "Ilić", "Ivanov", "Janković", "Jovanović",
  "Kovač", "Kovačević", "Marković", "Matić", "Milošević", "Nikolić", "Novak", "Pavlović", "Perić", "Petrović",
  "Popović", "Radić", "Savić", "Stanković", "Stojanović", "Tadić", "Tomić", "Vasić", "Vuković", "Zorić",
  "Kowalski", "Kowalczyk", "Lewandowski", "Mazur", "Nowak", "Pawłowski", "Piotrowski", "Sikora", "Szymański", "Wójcik",
  "Bartoš", "Černý", "Dvořák", "Horák", "Kovář", "Kučera", "Novák", "Procházka", "Svoboda", "Veselý",
  "Bondarenko", "Koval", "Kovalenko", "Kravchenko", "Melnyk", "Moroz", "Petrenko", "Shevchenko", "Tkachenko", "Volkov",
];

const EAST_ASIAN_LAST = [
  "Abe", "Aoki", "Endo", "Fujita", "Fujii", "Fukuda", "Goto", "Hashimoto", "Hayashi", "Honda",
  "Ikeda", "Ishikawa", "Ito", "Kato", "Kawasaki", "Kimura", "Kobayashi", "Kondo", "Maeda", "Matsuda",
  "Matsumoto", "Mori", "Murakami", "Nakagawa", "Nakamura", "Nakano", "Nakayama", "Ogawa", "Okada", "Saito",
  "Sasaki", "Shimizu", "Suzuki", "Takahashi", "Tanaka", "Ueda", "Watanabe", "Yamada", "Yamaguchi", "Yamashita",
  "Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim",
  "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou",
];

const AFRICAN_ARABIC_LAST = [
  "Abdallah", "Abdelrahman", "Abdi", "Abdou", "Aboubakar", "Adams", "Afolabi", "Ahmed", "Aidoo", "Akanji",
  "Akpan", "Ali", "Amrabat", "Ayew", "Bamba", "Bassey", "Benali", "Bennacer", "Camara", "Coulibaly",
  "Dabo", "Diallo", "Diaby", "Diarra", "Doumbia", "El Amrani", "El Khannouss", "Fofana", "Gueye", "Haddad",
  "Hakimi", "Hassan", "Idris", "Iheanacho", "Kamara", "Kante", "Keita", "Konaté", "Koulibaly", "Mahmoud",
  "Mane", "Mensah", "Mendy", "Mohamed", "Mokhtar", "Musa", "Ndiaye", "N'Diaye", "N'Dour", "Nwosu",
  "Okafor", "Okeke", "Okoro", "Onana", "Osei", "Ouédraogo", "Sarr", "Sow", "Sylla", "Touré",
  "Traoré", "Yeboah", "Ziyech", "Zouma", "Mokoena", "Khumalo", "Dlamini", "Ndlovu", "Mabena", "Mahlangu",
];

const FIRST_NAME_EXPANSION = [
  ...ENGLISH_FIRST,
  ...BRAZIL_FIRST,
  ...HISPANIC_FIRST,
  ...FRENCH_FIRST,
  ...ITALIAN_FIRST,
  ...GERMAN_DUTCH_FIRST,
  ...NORDIC_FIRST,
  ...SLAVIC_BALKAN_FIRST,
  ...EAST_ASIAN_FIRST,
  ...AFRICAN_ARABIC_FIRST,
];

const LAST_NAME_EXPANSION = [
  ...ENGLISH_LAST,
  ...BRAZIL_LAST,
  ...HISPANIC_LAST,
  ...FRENCH_LAST,
  ...ITALIAN_LAST,
  ...GERMAN_DUTCH_LAST,
  ...NORDIC_LAST,
  ...SLAVIC_BALKAN_LAST,
  ...EAST_ASIAN_LAST,
  ...AFRICAN_ARABIC_LAST,
];

let installed = false;

function appendUnique(target: string[], additions: string[]) {
  const seen = new Set(target);
  for (const name of additions) {
    if (seen.has(name)) continue;
    target.push(name);
    seen.add(name);
  }
}

export function installExpandedPlayerNames() {
  if (installed) return;
  appendUnique(RANDOM_NAME_FIRST_PART, FIRST_NAME_EXPANSION);
  appendUnique(RANDOM_NAME_LAST_PART, LAST_NAME_EXPANSION);
  installed = true;
}

export const PLAYER_NAME_EXPANSION_STATS = {
  firstNames: FIRST_NAME_EXPANSION.length,
  lastNames: LAST_NAME_EXPANSION.length,
} as const;
