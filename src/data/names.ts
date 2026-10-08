export const FIRST_NAMES = [
  'Luca', 'Mateo', 'Noah', 'Leon', 'Elias', 'Hugo', 'Oscar', 'Theo', 'Rafael', 'Diego', 'Marco', 'Tomas', 'Jonas', 'Felix',
  'Adrian', 'Victor', 'Samuel', 'Daniel', 'Nico', 'Ivan', 'Artem', 'Mikhail', 'Kirill', 'Dmitri', 'Pavel', 'Andrei', 'Yusuf',
  'Kofi', 'Amadou', 'Ibrahim', 'Sami', 'Karim', 'Joao', 'Thiago', 'Bruno', 'Pedro', 'Emil', 'Kasper', 'Lars', 'Mats', 'Arda',
  'Kenji', 'Ryo', 'Min-jun', 'Lucas', 'Gabriel', 'Enzo', 'Santiago', 'Julian', 'Milan', 'Stefan', 'Luka', 'Nikola', 'Oliver',
  'Jack', 'Harry', 'Callum', 'Rhys', 'Sean', 'Aaron', 'Moussa', 'Youssef', 'Tariq', 'Bastian', 'Florian', 'Anton', 'Max',
];

export const LAST_NAMES = [
  'Moreau', 'Silva', 'Novak', 'Kovac', 'Berger', 'Lindqvist', 'Rossi', 'Ferrari', 'Costa', 'Herrera', 'Navarro', 'Ortega',
  'Petrov', 'Volkov', 'Sokolov', 'Orlov', 'Belov', 'Morozov', 'Kuznetsov', 'Diallo', 'Traore', 'Mensah', 'Okafor', 'Haddad',
  'Mansour', 'Santos', 'Pereira', 'Almeida', 'Jensen', 'Nielsen', 'Larsen', 'Eriksen', 'Yilmaz', 'Demir', 'Tanaka', 'Sato',
  'Kim', 'Park', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Dubois', 'Laurent', 'Girard', 'Martins', 'Fontaine',
  'Romero', 'Vega', 'Castillo', 'Ibarra', 'Marin', 'Horvat', 'Babic', 'Jovanovic', 'Markovic', 'Walsh', 'Murphy', 'Hughes',
  'Bennett', 'Carter', 'Keane', 'Byrne', 'Lindgren', 'Holm', 'Strand', 'Bakker', 'De Vries', 'Visser', 'Mertens', 'Peeters',
];

/** Country-flavoured name pools for generated players and club coaches. */
export const NAMES_BY_COUNTRY: Record<'eng' | 'esp' | 'ita' | 'ger' | 'bra', { first: string[]; last: string[] }> = {
  eng: {
    first: ['Jack', 'Harry', 'James', 'Oliver', 'George', 'Charlie', 'Thomas', 'Alfie', 'Joe', 'Callum', 'Ben', 'Lewis', 'Ryan', 'Danny', 'Sam', 'Mason'],
    last: ['Walker', 'Clarke', 'Hughes', 'Bennett', 'Wright', 'Turner', 'Cole', 'Ward', 'Harris', 'Morgan', 'Fletcher', 'Barnes', 'Shaw', 'Holloway', 'Pearce', 'Dawson'],
  },
  esp: {
    first: ['Javier', 'Sergio', 'Pablo', 'Álvaro', 'Iker', 'Raúl', 'Dani', 'Marcos', 'Alejandro', 'Hugo', 'Unai', 'Rubén', 'Mikel', 'Adrián', 'Jordi', 'Íñigo'],
    last: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Molina', 'Ortiz', 'Iriondo'],
  },
  ita: {
    first: ['Lorenzo', 'Matteo', 'Alessandro', 'Federico', 'Davide', 'Riccardo', 'Gianluca', 'Andrea', 'Simone', 'Nicolò', 'Paolo', 'Stefano', 'Marco', 'Francesco', 'Luca', 'Tommaso'],
    last: ['Rossi', 'Bianchi', 'Esposito', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana'],
  },
  ger: {
    first: ['Lukas', 'Leon', 'Jonas', 'Felix', 'Maximilian', 'Niklas', 'Tim', 'Julian', 'Florian', 'Kai', 'Timo', 'Marco', 'Jan', 'Sebastian', 'Tobias', 'Matthias'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Braun', 'Krüger'],
  },
  bra: {
    first: ['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Rafael', 'Thiago', 'Gustavo', 'Bruno', 'Vinícius', 'Felipe', 'Rodrigo', 'Diego', 'André', 'Caio', 'Renan', 'Everton'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes', 'Barbosa', 'Rocha', 'Martins', 'Araújo'],
  },
};
