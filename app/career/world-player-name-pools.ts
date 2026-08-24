import { pick } from "./shared";

type NamePool = {
  first: readonly string[];
  last: readonly string[];
};

type NameStyle =
  | "brazil"
  | "lusophone"
  | "english"
  | "hispanic"
  | "french"
  | "italian"
  | "german"
  | "dutch"
  | "nordic"
  | "east-europe"
  | "greek"
  | "turkic"
  | "caucasus"
  | "hebrew"
  | "arabic"
  | "african"
  | "japanese"
  | "korean"
  | "chinese"
  | "south-east-asian"
  | "south-asian"
  | "pacific"
  | "international";

const POOLS: Record<NameStyle, NamePool> = {
  brazil: {
    first: [
      "Adriel", "Alan", "Alex", "Alexandre", "Alisson", "Anderson", "André", "Ângelo", "Arthur", "Augusto",
      "Bernardo", "Breno", "Bruno", "Caio", "Carlos", "Cássio", "Cauã", "Christian", "Darlan", "Davi",
      "Diego", "Douglas", "Ederson", "Eduardo", "Emerson", "Everton", "Fábio", "Felipe", "Fernando", "Gabriel",
      "Geovane", "Guilherme", "Gustavo", "Heitor", "Henrique", "Hugo", "Igor", "Jean", "Jeferson", "João",
      "Jonathan", "José", "Kelvin", "Leandro", "Leonardo", "Luan", "Lucas", "Luiz", "Maicon", "Marcelo",
      "Marcos", "Marlon", "Matheus", "Michel", "Murilo", "Nathan", "Pablo", "Patrick", "Paulo", "Pedro",
      "Rafael", "Ramon", "Renan", "Renato", "Ricardo", "Riquelme", "Roberto", "Rodrigo", "Ruan", "Samuel",
      "Thales", "Thiago", "Tiago", "Vagner", "Vanderson", "Victor", "Vinícius", "Wallace", "Wanderson", "Wendel",
      "Wesley", "William", "Yago", "Ygor", "Cícero", "Danilo", "Éder", "Fabricio", "Joanderson", "Kauã",
    ],
    last: [
      "Aguiar", "Almeida", "Alves", "Amorim", "Andrade", "Araújo", "Assis", "Azevedo", "Barbosa", "Barros",
      "Bastos", "Batista", "Bezerra", "Borges", "Brito", "Cabral", "Campos", "Cardoso", "Carvalho", "Castro",
      "Cavalcante", "Coelho", "Correia", "Costa", "Coutinho", "Cunha", "Diniz", "Duarte", "Farias", "Fernandes",
      "Figueiredo", "Fonseca", "Freitas", "Galvão", "Gomes", "Guimarães", "Lacerda", "Leite", "Lima", "Lopes",
      "Macedo", "Machado", "Magalhães", "Martins", "Matos", "Medeiros", "Melo", "Mendes", "Menezes", "Miranda",
      "Monteiro", "Moraes", "Morais", "Moreira", "Mota", "Moura", "Nascimento", "Neves", "Nunes", "Oliveira",
      "Pacheco", "Paiva", "Peixoto", "Pereira", "Pinto", "Porto", "Prado", "Queiroz", "Ramos", "Rangel",
      "Rezende", "Ribeiro", "Rocha", "Rodrigues", "Sales", "Santos", "Silva", "Siqueira", "Sousa", "Souza",
      "Tavares", "Teixeira", "Valente", "Varela", "Vasconcelos", "Viana", "Vieira", "Xavier", "Cavalcanti", "Maranhão",
    ],
  },
  lusophone: {
    first: [
      "Afonso", "Alexandre", "André", "António", "Bernardo", "Bruno", "Carlos", "Dinis", "Diogo", "Duarte",
      "Edgar", "Eduardo", "Fábio", "Francisco", "Gonçalo", "Guilherme", "Henrique", "Hugo", "Ivo", "João",
      "Jorge", "José", "Leandro", "Leonardo", "Luís", "Manuel", "Marco", "Martim", "Mateus", "Miguel",
      "Nuno", "Pedro", "Rafael", "Renato", "Ricardo", "Rodrigo", "Rui", "Salvador", "Simão", "Tiago",
      "Tomás", "Vasco", "Vítor", "Adilson", "Agostinho", "Amílcar", "Baltazar", "Dário", "Emanuel", "Gelson",
      "Hélder", "Joaquim", "Mário", "Nelson", "Osvaldo", "Paulo", "Quim", "Rúben", "Sérgio", "Zeca",
    ],
    last: [
      "Almeida", "Alves", "Amaral", "Andrade", "Antunes", "Azevedo", "Barbosa", "Barros", "Borges", "Braga",
      "Cabral", "Cardoso", "Carvalho", "Castro", "Coelho", "Correia", "Costa", "Cunha", "Dias", "Duarte",
      "Esteves", "Faria", "Fernandes", "Ferreira", "Fonseca", "Freitas", "Gomes", "Gonçalves", "Lemos", "Lima",
      "Lopes", "Machado", "Marques", "Martins", "Mendes", "Miranda", "Monteiro", "Mota", "Moura", "Neves",
      "Nogueira", "Nunes", "Oliveira", "Pacheco", "Pereira", "Pinto", "Pires", "Ramos", "Reis", "Ribeiro",
      "Rocha", "Rodrigues", "Santos", "Silva", "Soares", "Sousa", "Tavares", "Teixeira", "Vieira", "Vaz",
    ],
  },
  english: {
    first: [
      "Aaron", "Adam", "Aidan", "Alex", "Alfie", "Andrew", "Anthony", "Archie", "Arthur", "Austin",
      "Benjamin", "Blake", "Bradley", "Brandon", "Caleb", "Callum", "Cameron", "Charlie", "Connor", "Daniel",
      "Danny", "David", "Declan", "Dominic", "Dylan", "Edward", "Elliot", "Ethan", "Evan", "Finley",
      "Finn", "Freddie", "George", "Harry", "Harvey", "Henry", "Isaac", "Jack", "Jacob", "Jake",
      "James", "Jamie", "Jayden", "Joel", "John", "Jonathan", "Jordan", "Joseph", "Joshua", "Jude",
      "Kai", "Kieran", "Kyle", "Leo", "Lewis", "Liam", "Logan", "Louis", "Luke", "Mason",
      "Matthew", "Max", "Michael", "Nathan", "Nicholas", "Oliver", "Oscar", "Owen", "Reece", "Rhys",
      "Robert", "Rory", "Ryan", "Samuel", "Scott", "Sean", "Sebastian", "Theo", "Thomas", "Tyler",
      "William", "Zachary", "Curtis", "Dean", "Ellis", "Harley", "Harrison", "Mitchell", "Reuben", "Tommy",
    ],
    last: [
      "Adams", "Allen", "Anderson", "Armstrong", "Bailey", "Baker", "Barker", "Barnes", "Bell", "Bennett",
      "Black", "Bradley", "Brooks", "Brown", "Burke", "Burns", "Butler", "Campbell", "Carter", "Chapman",
      "Clark", "Clarke", "Cole", "Collins", "Cook", "Cooper", "Cox", "Davies", "Davis", "Dawson",
      "Dean", "Dixon", "Doyle", "Duncan", "Edwards", "Elliott", "Evans", "Fisher", "Fletcher", "Ford",
      "Foster", "Fraser", "Gardner", "Gibson", "Graham", "Grant", "Gray", "Green", "Hall", "Hamilton",
      "Harris", "Harrison", "Henderson", "Hill", "Howard", "Hudson", "Hughes", "Hunter", "Jackson", "Jenkins",
      "Johnson", "Jones", "Kelly", "Kennedy", "King", "Knight", "Lewis", "Marshall", "Martin", "Mason",
      "Miller", "Mitchell", "Moore", "Morgan", "Morris", "Murphy", "Murray", "Nelson", "Palmer", "Parker",
      "Phillips", "Price", "Reid", "Roberts", "Robertson", "Robinson", "Ross", "Scott", "Shaw", "Smith",
      "Stewart", "Taylor", "Thomas", "Thompson", "Turner", "Walker", "Ward", "Watson", "White", "Williams",
      "Wilson", "Wood", "Wright", "Young", "O'Brien", "McCarthy", "McDonald", "McGregor", "Ferguson", "Gallagher",
    ],
  },
  hispanic: {
    first: [
      "Agustín", "Alejandro", "Álvaro", "Andrés", "Ángel", "Antonio", "Benjamín", "Bruno", "Carlos", "Cristian",
      "Cristóbal", "Damián", "Diego", "Eduardo", "Emiliano", "Ezequiel", "Facundo", "Federico", "Fernando", "Franco",
      "Gael", "Gonzalo", "Guillermo", "Ignacio", "Iker", "Javier", "Joaquín", "Jorge", "José", "Juan",
      "Julián", "Lautaro", "Leandro", "Manuel", "Marco", "Marcos", "Martín", "Mateo", "Matías", "Miguel",
      "Nahuel", "Nicolás", "Pablo", "Ramiro", "Rodrigo", "Santiago", "Sergio", "Tomás", "Valentín", "Vicente",
      "Adrián", "César", "Darío", "Fabián", "Gerardo", "Héctor", "Iván", "Jesús", "Kevin", "Luis",
      "Mauricio", "Óscar", "Rafael", "Raúl", "Rubén", "Salvador", "Sebastián", "Víctor", "Xavier", "Yago",
    ],
    last: [
      "Acosta", "Aguilar", "Alonso", "Álvarez", "Arias", "Benítez", "Blanco", "Bravo", "Cabrera", "Campos",
      "Carrasco", "Castillo", "Castro", "Contreras", "Córdoba", "Correa", "Cruz", "Delgado", "Díaz", "Domínguez",
      "Escobar", "Fernández", "Flores", "Fuentes", "García", "Giménez", "Gómez", "González", "Guerrero", "Gutiérrez",
      "Hernández", "Herrera", "Ibarra", "Jiménez", "López", "Martínez", "Medina", "Méndez", "Molina", "Montoya",
      "Morales", "Moreno", "Muñoz", "Navarro", "Núñez", "Ortega", "Ortiz", "Paredes", "Pérez", "Ramírez",
      "Ramos", "Reyes", "Ríos", "Rivera", "Rodríguez", "Rojas", "Romero", "Ruiz", "Salazar", "Sánchez",
      "Silva", "Suárez", "Torres", "Valencia", "Vargas", "Vázquez", "Vega", "Vidal", "Zamora", "Zapata",
    ],
  },
  french: {
    first: [
      "Adrien", "Alexandre", "Antoine", "Aurélien", "Baptiste", "Benjamin", "Clément", "Corentin", "Damien", "Enzo",
      "Étienne", "Florian", "Gaëtan", "Hugo", "Jean", "Jules", "Julien", "Lilian", "Loïc", "Lucas",
      "Malo", "Mathéo", "Mathieu", "Maxence", "Maxime", "Noé", "Nolan", "Olivier", "Paul", "Pierre",
      "Raphaël", "Romain", "Sacha", "Théo", "Thomas", "Valentin", "Yanis", "Yohan", "Axel", "Quentin",
      "Rémi", "Bastien", "Cédric", "Dorian", "Émile", "Fabien", "Gaspard", "Léo", "Morgan", "Tristan",
    ],
    last: [
      "Andre", "Arnaud", "Aubert", "Barbier", "Bernard", "Bertrand", "Blanc", "Boucher", "Bourgeois", "Brun",
      "Caron", "Chevalier", "Clement", "Colin", "David", "Denis", "Dubois", "Dufour", "Dumas", "Dupont",
      "Durand", "Fabre", "Faure", "Fontaine", "Fournier", "François", "Garnier", "Gauthier", "Gerard", "Girard",
      "Giraud", "Guerin", "Henry", "Hubert", "Lacroix", "Lambert", "Laurent", "Leclerc", "Lefebvre", "Legrand",
      "Lemoine", "Leroy", "Marchand", "Martin", "Masson", "Mathieu", "Mercier", "Meyer", "Michel", "Moreau",
      "Moulin", "Nicolas", "Noel", "Olivier", "Perrin", "Petit", "Philippe", "Picard", "Renard", "Richard",
      "Robert", "Robin", "Roche", "Rousseau", "Roussel", "Simon", "Thomas", "Vincent", "Diallo", "Traoré",
    ],
  },
  italian: {
    first: [
      "Alessandro", "Alessio", "Andrea", "Angelo", "Antonio", "Christian", "Daniele", "Davide", "Domenico", "Edoardo",
      "Elia", "Emanuele", "Fabio", "Federico", "Filippo", "Francesco", "Gabriele", "Giacomo", "Gianluca", "Giorgio",
      "Giovanni", "Giulio", "Leonardo", "Lorenzo", "Luca", "Marco", "Matteo", "Mattia", "Michele", "Niccolò",
      "Paolo", "Pietro", "Riccardo", "Roberto", "Salvatore", "Samuele", "Simone", "Stefano", "Tommaso", "Vincenzo",
      "Alberto", "Claudio", "Cristiano", "Enrico", "Fabrizio", "Massimo", "Maurizio", "Nicola", "Raffaele", "Sandro",
    ],
    last: [
      "Amato", "Barbieri", "Basile", "Benedetti", "Bernardi", "Bianchi", "Bruno", "Caruso", "Colombo", "Conti",
      "Coppola", "Costa", "De Angelis", "De Luca", "De Santis", "Esposito", "Ferrara", "Ferrari", "Fontana", "Gallo",
      "Giordano", "Giuliani", "Greco", "Leone", "Lombardi", "Longo", "Mancini", "Marchetti", "Mariani", "Marino",
      "Martinelli", "Martini", "Mazza", "Messina", "Monti", "Moretti", "Orlando", "Palmieri", "Parisi", "Pellegrini",
      "Ricci", "Rinaldi", "Riva", "Rizzo", "Romano", "Rossi", "Santoro", "Serra", "Silvestri", "Testa",
      "Valentini", "Villa", "Vitale", "Bellini", "Berti", "Bianco", "Caputo", "Donati", "Fabbri", "Fiore",
    ],
  },
  german: {
    first: [
      "Alexander", "Anton", "Bastian", "Benedikt", "Benjamin", "Björn", "Christian", "Christoph", "Daniel", "Dennis",
      "Dominik", "Felix", "Florian", "Franz", "Frederik", "Hannes", "Jan", "Jonas", "Julian", "Kai",
      "Kevin", "Lars", "Leon", "Lukas", "Marco", "Marcel", "Mario", "Maximilian", "Moritz", "Niklas",
      "Nils", "Pascal", "Patrick", "Philipp", "Sebastian", "Simon", "Timo", "Tobias", "Yannick", "Luca",
      "Adrian", "Fabian", "Johannes", "Leonard", "Manuel", "Matthias", "Michael", "Oliver", "Stefan", "Thomas",
    ],
    last: [
      "Bauer", "Baumann", "Becker", "Berger", "Bergmann", "Braun", "Brandt", "Dietrich", "Engel", "Fischer",
      "Frank", "Friedrich", "Fuchs", "Graf", "Groß", "Günther", "Hahn", "Hartmann", "Herrmann", "Hoffmann",
      "Huber", "Jäger", "Kaiser", "Keller", "Klein", "Koch", "Köhler", "König", "Krause", "Krüger",
      "Lang", "Lehmann", "Lorenz", "Maier", "Mayer", "Meier", "Meyer", "Müller", "Neumann", "Otto",
      "Peters", "Richter", "Roth", "Sauer", "Schäfer", "Schmidt", "Schneider", "Scholz", "Schreiber", "Schröder",
      "Schubert", "Schulz", "Schwarz", "Vogel", "Wagner", "Weber", "Werner", "Wolf", "Zimmermann", "Kramer",
    ],
  },
  dutch: {
    first: [
      "Bram", "Daan", "Dirk", "Finn", "Frenkie", "Gijs", "Jasper", "Jeroen", "Jesse", "Joep",
      "Joost", "Joris", "Koen", "Lars", "Luuk", "Maarten", "Mats", "Mees", "Milan", "Niek",
      "Pim", "Ruben", "Sem", "Siem", "Sven", "Teun", "Thijs", "Timo", "Wout", "Xavi",
      "Bas", "Davy", "Erik", "Floris", "Hendrik", "Jens", "Jochem", "Kevin", "Martijn", "Rick",
    ],
    last: [
      "Bakker", "Bos", "Bosman", "De Boer", "De Graaf", "De Jong", "De Vries", "Dekker", "Dijkstra", "Hendriks",
      "Hoekstra", "Jacobs", "Jansen", "Kok", "Kuipers", "Meijer", "Mulder", "Peters", "Postma", "Smit",
      "Smits", "Van Beek", "Van Dam", "Van den Berg", "Van der Meer", "Van Dijk", "Van Leeuwen", "Van Loon", "Van Vliet", "Verhoeven",
      "Vermeer", "Visser", "Vos", "Willems", "Wolters", "De Wit", "Van der Berg", "Van Rijn", "Van der Velde", "Koster",
    ],
  },
  nordic: {
    first: [
      "Aksel", "Albin", "Anders", "Andreas", "Aron", "Birk", "Elias", "Emil", "Erik", "Espen",
      "Filip", "Frederik", "Gustav", "Håkon", "Henrik", "Isak", "Jens", "Jesper", "Jonas", "Kasper",
      "Kristian", "Lasse", "Linus", "Magnus", "Marius", "Martin", "Mathias", "Mikkel", "Nikolaj", "Oskar",
      "Pontus", "Rasmus", "Sander", "Sindre", "Stian", "Søren", "Tobias", "Viggo", "Viktor", "William",
      "Arvid", "Einar", "Gunnar", "Leif", "Mikael", "Nils", "Rune", "Sven", "Tor", "Vidar",
    ],
    last: [
      "Andersen", "Andersson", "Berg", "Bergström", "Christensen", "Dahl", "Eriksen", "Eriksson", "Hansen", "Hansson",
      "Henriksen", "Holm", "Johansen", "Johansson", "Jørgensen", "Karlsson", "Kristensen", "Larsen", "Larsson", "Lindberg",
      "Lund", "Madsen", "Magnusson", "Nielsen", "Nilsson", "Olsen", "Olsson", "Pedersen", "Persson", "Petersen",
      "Rasmussen", "Sandberg", "Svensson", "Sørensen", "Thomsen", "Björk", "Einarsson", "Gunnarsson", "Hauksson", "Jónsson",
      "Sigurðsson", "Aas", "Bakke", "Hagen", "Haugen", "Moen", "Nygård", "Solberg", "Strand", "Brekke",
    ],
  },
  "east-europe": {
    first: [
      "Aleksandar", "Aleksandr", "Andrej", "Andriy", "Ante", "Bojan", "Boris", "Branko", "Damir", "Dejan",
      "Dmytro", "Dominik", "Dragan", "Filip", "Goran", "Ivan", "Jakub", "Jan", "Josip", "Kamil",
      "Karol", "Luka", "Lukáš", "Marcin", "Marek", "Marko", "Matej", "Mateusz", "Milan", "Miloš",
      "Miroslav", "Nikola", "Ognjen", "Oleksandr", "Ondřej", "Patrik", "Pavel", "Petar", "Piotr", "Radek",
      "Robert", "Stefan", "Tomasz", "Václav", "Viktor", "Vladimir", "Zoran", "Đorđe", "Krzysztof", "Mihai",
      "Andrei", "Bogdan", "Cristian", "Florin", "István", "Márton", "Attila", "Radu", "Sorin", "Vlad",
    ],
    last: [
      "Babić", "Bilić", "Božić", "Dimitrov", "Đorđević", "Horvat", "Ilić", "Ivanov", "Janković", "Jovanović",
      "Kovač", "Kovačević", "Marković", "Matić", "Milošević", "Nikolić", "Novak", "Pavlović", "Perić", "Petrović",
      "Popović", "Radić", "Savić", "Stanković", "Stojanović", "Tadić", "Tomić", "Vasić", "Vuković", "Zorić",
      "Kowalski", "Kowalczyk", "Lewandowski", "Mazur", "Nowak", "Pawłowski", "Piotrowski", "Sikora", "Szymański", "Wójcik",
      "Bartoš", "Černý", "Dvořák", "Horák", "Kovář", "Kučera", "Novák", "Procházka", "Svoboda", "Veselý",
      "Bondarenko", "Koval", "Kovalenko", "Kravchenko", "Melnyk", "Moroz", "Petrenko", "Shevchenko", "Tkachenko", "Volkov",
      "Popescu", "Ionescu", "Dumitru", "Stan", "Nagy", "Kovács", "Szabó", "Horváth", "Tóth", "Varga",
    ],
  },
  greek: {
    first: ["Alexandros", "Andreas", "Angelos", "Christos", "Dimitris", "Giorgos", "Giannis", "Kostas", "Manolis", "Michalis", "Nikos", "Panagiotis", "Petros", "Sotiris", "Spiros", "Stavros", "Thanasis", "Theodoros", "Vangelis", "Yannis"],
    last: ["Alexandris", "Anastasios", "Antoniou", "Christodoulou", "Dimitriou", "Georgiou", "Ioannidis", "Karagiannis", "Konstantinou", "Kostas", "Lazaridis", "Mavros", "Nikolaidis", "Nikolaou", "Papadopoulos", "Pappas", "Petrakis", "Samaras", "Stavrou", "Vlachos"],
  },
  turkic: {
    first: ["Ahmet", "Ali", "Arda", "Barış", "Batuhan", "Berk", "Burak", "Can", "Cenk", "Emir", "Emre", "Enes", "Eren", "Furkan", "Hakan", "Halil", "İbrahim", "Kerem", "Mehmet", "Mert", "Murat", "Oğuz", "Onur", "Orkun", "Salih", "Serdar", "Sinan", "Tolga", "Umut", "Yusuf"],
    last: ["Acar", "Aksoy", "Arslan", "Aydın", "Çelik", "Demir", "Doğan", "Erdem", "Erdoğan", "Güler", "Güneş", "Kara", "Kaya", "Keskin", "Kılıç", "Koç", "Korkmaz", "Kurt", "Özdemir", "Öztürk", "Polat", "Şahin", "Tekin", "Toprak", "Turan", "Uzun", "Yalçın", "Yıldırım", "Yıldız", "Yılmaz"],
  },
  caucasus: {
    first: ["Aram", "Arman", "Artur", "Davit", "Giorgi", "Guram", "Hayk", "Irakli", "Karen", "Levan", "Mikheil", "Narek", "Nika", "Sandro", "Sergey", "Tigran", "Vahan", "Vakhtang", "Zurab", "Ashot"],
    last: ["Abrahamyan", "Arakelyan", "Avetisyan", "Davtyan", "Grigoryan", "Hakobyan", "Harutyunyan", "Hovhannisyan", "Karapetyan", "Mkrtchyan", "Beridze", "Chikovani", "Dvali", "Gogoladze", "Kapanadze", "Kvaratskhelia", "Lomidze", "Maisuradze", "Mikautadze", "Tsereteli"],
  },
  hebrew: {
    first: ["Ariel", "Bar", "Daniel", "David", "Dor", "Eden", "Eli", "Eyal", "Gal", "Idan", "Itai", "Lior", "Maor", "Matan", "Nadav", "Nir", "Noam", "Omer", "Ori", "Ron", "Shai", "Tal", "Tomer", "Yarden", "Yonatan"],
    last: ["Abraham", "Azoulay", "Ben David", "Biton", "Cohen", "Dahan", "David", "Gabay", "Hazan", "Katz", "Levi", "Mizrahi", "Ohana", "Peretz", "Revivo", "Shapira", "Sharabi", "Tal", "Yosef", "Zahavi"],
  },
  arabic: {
    first: [
      "Abdallah", "Abdul", "Ahmed", "Ali", "Amin", "Amir", "Anas", "Ayoub", "Bilal", "Fares",
      "Hakim", "Hamza", "Hassan", "Hicham", "Ilyas", "Ismail", "Karim", "Khalid", "Mahmoud", "Mohamed",
      "Mustapha", "Nabil", "Nasser", "Omar", "Rachid", "Rami", "Riyad", "Said", "Salim", "Sami",
      "Tariq", "Walid", "Yacine", "Yassine", "Youssef", "Zakaria", "Ziad", "Adel", "Bader", "Fahad",
      "Hussein", "Jamal", "Khalifa", "Majid", "Nawaf", "Saad", "Salem", "Sultan", "Yahya", "Zayed",
    ],
    last: [
      "Abbas", "Abdallah", "Abdelrahman", "Ahmed", "Ali", "Amrabat", "Ayari", "Bensaid", "Bennacer", "Benali",
      "Boufal", "Chakla", "El Amrani", "El Arabi", "El Khannouss", "Fathi", "Haddad", "Hakimi", "Hamdi", "Hassan",
      "Hussein", "Ibrahim", "Jaber", "Khalil", "Mahmoud", "Mansour", "Mohamed", "Mokhtar", "Nasser", "Rahman",
      "Saad", "Saleh", "Salem", "Sharif", "Soliman", "Youssef", "Zaki", "Zayed", "Al Harbi", "Al Qahtani",
      "Al Rashid", "Al Shammari", "Al Sulaiti", "Al Dawsari", "Al Nuaimi", "Al Kuwari", "Al Busaidi", "Al Khaldi", "Darwish", "Faraj",
    ],
  },
  african: {
    first: [
      "Abdoulaye", "Adama", "Amadou", "Boubacar", "Cheick", "Demba", "Ibrahima", "Idrissa", "Mahamadou", "Mamadou",
      "Moussa", "Ousmane", "Sadio", "Samba", "Souleymane", "Kwame", "Kofi", "Yaw", "Kojo", "Samuel",
      "Chinedu", "Chukwuma", "Emeka", "Ifeanyi", "Kelechi", "Moses", "Tunde", "Victor", "Wilfred", "Siyabonga",
      "Sipho", "Thabo", "Themba", "Kabelo", "Lebo", "Percy", "Thulani", "Tendai", "Tinashe", "Blessing",
      "Kelvin", "Brian", "Dennis", "Collins", "Francis", "Patrick", "Emmanuel", "Godwin", "Junior", "Prosper",
    ],
    last: [
      "Aboubakar", "Afolabi", "Aidoo", "Akpan", "Ayew", "Bamba", "Bassey", "Camara", "Coulibaly", "Dabo",
      "Diallo", "Diaby", "Diarra", "Doumbia", "Fofana", "Gueye", "Idris", "Iheanacho", "Kamara", "Kante",
      "Keita", "Konaté", "Koulibaly", "Mane", "Mensah", "Mendy", "Musa", "Ndiaye", "N'Diaye", "N'Dour",
      "Nwosu", "Okafor", "Okeke", "Okoro", "Onana", "Osei", "Ouédraogo", "Sarr", "Sow", "Sylla",
      "Touré", "Traoré", "Yeboah", "Mokoena", "Khumalo", "Dlamini", "Ndlovu", "Mabena", "Mahlangu", "Mthembu",
      "Mwangi", "Otieno", "Kamau", "Omondi", "Banda", "Phiri", "Moyo", "Ncube", "Chanda", "Tembo",
    ],
  },
  japanese: {
    first: [
      "Aoi", "Daichi", "Daiki", "Haruki", "Haruto", "Hayato", "Hikaru", "Hiroki", "Hiroto", "Itsuki",
      "Kaito", "Kazuki", "Keisuke", "Kenta", "Koji", "Makoto", "Naoki", "Ren", "Riku", "Ryo",
      "Ryota", "Shota", "Sota", "Takumi", "Taro", "Yuki", "Yuma", "Yuto", "Akira", "Kazuya",
      "Masato", "Shinji", "Shun", "Taichi", "Takahiro", "Takashi", "Yusuke", "Yuya", "Koki", "Reo",
    ],
    last: [
      "Abe", "Aoki", "Endo", "Fujita", "Fujii", "Fukuda", "Goto", "Hashimoto", "Hayashi", "Honda",
      "Ikeda", "Ishikawa", "Ito", "Kato", "Kawasaki", "Kimura", "Kobayashi", "Kondo", "Maeda", "Matsuda",
      "Matsumoto", "Mori", "Murakami", "Nakagawa", "Nakamura", "Nakano", "Nakayama", "Ogawa", "Okada", "Saito",
      "Sakamoto", "Sasaki", "Shimizu", "Suzuki", "Takahashi", "Tanaka", "Ueda", "Watanabe", "Yamada", "Yamaguchi",
      "Yamashita", "Yamamoto", "Kishimoto", "Fujimoto", "Matsubara", "Kubo", "Mitoma", "Morita", "Tomiyasu", "Doan",
    ],
  },
  korean: {
    first: ["Min-jun", "Ji-hoon", "Hyun-woo", "Seung-ho", "Joon-ho", "Dong-hyun", "Tae-yang", "Jun-seo", "Sung-min", "Woo-jin", "Jae-sung", "Min-jae", "Hee-chan", "Kang-in", "Young-gwon", "Jin-su", "Seung-min", "Hyun-seok", "Jun-ho", "Sang-ho", "Tae-hyun", "Dong-jun", "Jae-won", "Min-kyu", "Seok-hyun"],
    last: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Shin", "Seo", "Kwon", "Hwang", "Ahn", "Song", "Hong", "Yoo", "Moon"],
  },
  chinese: {
    first: ["Bo", "Chen", "Cheng", "Hao", "Jian", "Jun", "Kai", "Lei", "Long", "Ming", "Peng", "Qiang", "Tao", "Wei", "Xiang", "Xiao", "Xin", "Yang", "Yichen", "Yong", "Yu", "Yuan", "Zhen", "Zhi", "Zhou"],
    last: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Gao", "Lin", "Luo", "Zheng", "Liang", "Xie", "Song", "Tang"],
  },
  "south-east-asian": {
    first: ["Adi", "Agus", "Andi", "Arif", "Bagus", "Bima", "Dimas", "Fajar", "Rizky", "Yoga", "An", "Bao", "Duc", "Hai", "Huy", "Khoa", "Minh", "Nam", "Phuc", "Quang", "Tuan", "Anh", "Chai", "Kittisak", "Nattapong", "Sakda", "Somchai", "Thanawat", "Aiman", "Faris", "Hakim", "Irfan", "Syafiq", "Azlan", "Paolo", "Miguel", "Carlo", "Joshua", "Gabriel", "Marco"],
    last: ["Santoso", "Wijaya", "Pratama", "Saputra", "Hidayat", "Ramadhan", "Setiawan", "Nugroho", "Kurniawan", "Siregar", "Nguyen", "Tran", "Le", "Pham", "Hoang", "Huynh", "Phan", "Vu", "Dang", "Bui", "Srisai", "Thongchai", "Chaiyaporn", "Boonmee", "Saelim", "Rahman", "Ismail", "Hassan", "Aziz", "Yusof", "Santos", "Reyes", "Cruz", "Garcia", "Mendoza", "Navarro", "Aquino", "Villanueva", "Castillo", "Ramos"],
  },
  "south-asian": {
    first: ["Aarav", "Aditya", "Akash", "Amit", "Arjun", "Dev", "Karan", "Manish", "Nikhil", "Rahul", "Raj", "Rohan", "Sahil", "Sanjay", "Vikram", "Arif", "Farhan", "Hasan", "Imran", "Nabil", "Rafi", "Rahim", "Sakib", "Tanvir", "Anil", "Bikash", "Dipesh", "Kiran", "Prakash", "Ramesh"],
    last: ["Agarwal", "Chauhan", "Das", "Desai", "Gupta", "Jain", "Kapoor", "Khan", "Kumar", "Mehta", "Mishra", "Patel", "Rao", "Reddy", "Shah", "Sharma", "Singh", "Verma", "Yadav", "Chowdhury", "Hossain", "Islam", "Rahman", "Ahmed", "Thapa", "Gurung", "Rai", "Shrestha", "Karki", "Tamang"],
  },
  pacific: {
    first: ["Aisea", "Ben", "Daniel", "Eroni", "George", "Iliesa", "Jone", "Josua", "Kelepi", "Laisenia", "Manasa", "Meli", "Pita", "Ratu", "Samuel", "Samuela", "Semi", "Sireli", "Tevita", "Viliame", "Tama", "Tane", "Sione", "Latu", "Manu"],
    last: ["Bale", "Cakau", "Dawai", "Drua", "Koro", "Lal", "Mata", "Nacewa", "Nakarawa", "Nayacalevu", "Qera", "Radradra", "Ravai", "Serevi", "Tuisova", "Vakatawa", "Vunipola", "Fekitoa", "Latu", "Manu", "Taufua", "Taukeiaho", "Katoa", "Fa'alogo", "Sopoaga"],
  },
  international: {
    first: ["Adam", "Alex", "Daniel", "David", "Elias", "Enzo", "Gabriel", "Ivan", "Leo", "Luca", "Marco", "Mateo", "Michael", "Noah", "Rayan", "Samuel", "Theo", "Victor", "Yuri", "Zaid"],
    last: ["Costa", "Martin", "Silva", "Rossi", "Miller", "Novak", "Kim", "Tanaka", "Diallo", "Haddad", "Kaya", "Santos", "Moretti", "Navarro", "Lindberg", "Petrov", "Mensah", "Lee", "Rojas", "Ali"],
  },
};

const COUNTRY_STYLE: Record<string, NameStyle> = {
  // Lusófonos
  brasil: "brazil",
  portugal: "lusophone",
  angola: "lusophone",
  "cabo-verde": "lusophone",
  mocambique: "lusophone",

  // Anglófonos e países onde o inglês domina o futebol local
  inglaterra: "english",
  escocia: "english",
  "pais-de-gales": "english",
  irlanda: "english",
  "irlanda-do-norte": "english",
  eua: "english",
  canada: "english",
  australia: "english",
  "nova-zelandia": "english",
  jamaica: "english",
  "trinidad-e-tobago": "english",
  gibraltar: "english",
  malta: "english",

  // Espanhol
  argentina: "hispanic",
  uruguai: "hispanic",
  chile: "hispanic",
  colombia: "hispanic",
  paraguai: "hispanic",
  equador: "hispanic",
  peru: "hispanic",
  bolivia: "hispanic",
  venezuela: "hispanic",
  mexico: "hispanic",
  "costa-rica": "hispanic",
  panama: "hispanic",
  espanha: "hispanic",
  "el-salvador": "hispanic",
  guatemala: "hispanic",
  honduras: "hispanic",
  nicaragua: "hispanic",
  "republica-dominicana": "hispanic",
  andorra: "hispanic",
  "guine-equatorial": "hispanic",

  // Francófonos
  franca: "french",
  belgica: "french",
  luxemburgo: "french",
  haiti: "french",
  taiti: "french",
  "nova-caledonia": "french",
  gabao: "french",
  guine: "french",
  "costa-do-marfim": "french",
  "burkina-faso": "french",
  benim: "french",
  mali: "french",
  camaroes: "french",

  // Europa ocidental
  italia: "italian",
  vaticano: "italian",
  "san-marino": "italian",
  alemanha: "german",
  austria: "german",
  suica: "german",
  liechtenstein: "german",
  holanda: "dutch",
  curacao: "dutch",
  suriname: "dutch",

  // Nórdicos
  dinamarca: "nordic",
  noruega: "nordic",
  suecia: "nordic",
  islandia: "nordic",
  finlandia: "nordic",
  "ilhas-faroe": "nordic",

  // Europa central/oriental e Bálcãs
  croacia: "east-europe",
  polonia: "east-europe",
  servia: "east-europe",
  ucrania: "east-europe",
  "republica-tcheca": "east-europe",
  romenia: "east-europe",
  hungria: "east-europe",
  albania: "east-europe",
  bosnia: "east-europe",
  bulgaria: "east-europe",
  kosovo: "east-europe",
  montenegro: "east-europe",
  "macedonia-do-norte": "east-europe",
  eslovaquia: "east-europe",
  eslovenia: "east-europe",
  moldavia: "east-europe",
  estonia: "east-europe",
  letonia: "east-europe",
  lituania: "east-europe",
  grecia: "greek",
  chipre: "greek",

  // Turquia, Cáucaso e Ásia Central
  turquia: "turkic",
  azerbaijao: "turkic",
  cazaquistao: "turkic",
  uzbequistao: "turkic",
  georgia: "caucasus",
  armenia: "caucasus",
  israel: "hebrew",

  // Mundo árabe e Magrebe
  "arabia-saudita": "arabic",
  iraque: "arabic",
  catar: "arabic",
  marrocos: "arabic",
  egito: "arabic",
  argelia: "arabic",
  tunisia: "arabic",
  "emirados-arabes": "arabic",
  jordania: "arabic",
  oma: "arabic",
  bahrein: "arabic",
  kuwait: "arabic",
  siria: "arabic",
  libano: "arabic",
  palestina: "arabic",
  ira: "arabic",

  // África
  senegal: "african",
  nigeria: "african",
  gana: "african",
  "africa-do-sul": "african",
  zambia: "african",
  zimbabue: "african",
  uganda: "african",
  tanzania: "african",
  quenia: "african",

  // Leste Asiático
  japao: "japanese",
  "coreia-do-sul": "korean",
  "coreia-do-norte": "korean",
  china: "chinese",
  mongolia: "chinese",

  // Sul e sudeste asiático
  tailandia: "south-east-asian",
  vietna: "south-east-asian",
  indonesia: "south-east-asian",
  malasia: "south-east-asian",
  filipinas: "south-east-asian",
  india: "south-asian",
  nepal: "south-asian",
  butao: "south-asian",
  bangladesh: "south-asian",

  // Oceania insular
  fiji: "pacific",
  "ilhas-salomao": "pacific",
  "papua-nova-guine": "pacific",
  vanuatu: "pacific",
};

export function nameStyleForNationality(countryId: string): NameStyle {
  return COUNTRY_STYLE[countryId] ?? "international";
}

export function worldPlayerNameForNationality(countryId: string, seed: number, salt: number) {
  const pool = POOLS[nameStyleForNationality(countryId)];
  return `${pick(pool.first, seed, salt)} ${pick(pool.last, seed, salt + 6)}`;
}

export const WORLD_PLAYER_NAME_POOL_STATS = Object.fromEntries(
  Object.entries(POOLS).map(([style, pool]) => [style, { first: pool.first.length, last: pool.last.length }]),
) as Record<NameStyle, { first: number; last: number }>;
