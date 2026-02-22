-- CineClue Migration 003: Seed 15 movies (5 easy, 6 medium, 4 hard)

INSERT INTO cc_movies (title, alt, diff, lb, clues, genres, country, decade, director) VALUES

-- FÁCIL (5)
('El Padrino', ARRAY['The Godfather','Godfather'], 'fácil', 'the-godfather',
 '["🐴 🩸 🍝 👨‍👧 🎻", "El gato que aparece en la primera escena no estaba en el guión. Lo encontraron en el estudio y Brando lo adoptó para la toma.", "Un estudio rechazó al director tres veces antes de darle luz verde. El protagonista casi fue otro actor muy rubio.", "\"Le voy a hacer una oferta que no podrá rechazar.\"", "Un patriarca del crimen organizado en Nueva York intenta proteger su imperio familiar mientras su hijo menor, que rechazaba ese mundo, se ve arrastrado a tomar el control."]'::jsonb,
 ARRAY['drama','crimen'], 'Estados Unidos', 1970, 'Francis Ford Coppola'),

('Titanic', ARRAY['Titánic'], 'fácil', 'titanic',
 '["🚢 💎 🧊 🎨 ❄️", "La escena del dibujo fue lo primero que se filmó. El director es zurdo y dibujó él mismo el retrato, pero la imagen se invirtió en postproducción.", "El presupuesto superó al costo real de construir el barco original ajustado por inflación. Se construyó un set del 90% del tamaño real.", "\"Soy el rey del mundo.\"", "Una joven de clase alta se enamora de un artista sin dinero durante el viaje inaugural de un transatlántico que se hunde en el Atlántico Norte en 1912."]'::jsonb,
 ARRAY['drama','romance'], 'Estados Unidos', 1990, 'James Cameron'),

('Toy Story', ARRAY['Toy Story 1'], 'fácil', 'toy-story',
 '["🤠 🚀 👦 🧸 ♾️", "Fue la primera película hecha completamente por computadora. El estudio casi la cancela porque el protagonista era demasiado antipático en las primeras versiones.", "El actor que le da voz al vaquero también es famoso por protagonizar una sitcom sobre un náufrago en una isla con un amigo imaginario.", "\"Hasta el infinito... ¡y más allá!\"", "Los juguetes de un niño cobran vida cuando él no mira. El favorito, un vaquero, siente celos cuando llega un nuevo juguete espacial que no sabe que es un juguete."]'::jsonb,
 ARRAY['animación','aventura','comedia'], 'Estados Unidos', 1990, 'John Lasseter'),

('Matrix', ARRAY['The Matrix','La Matrix'], 'fácil', 'the-matrix',
 '["💊 😎 🥋 📞 🖥️", "Los actores entrenaron artes marciales durante 4 meses. La coreografía estuvo a cargo del mismo equipo de las películas de kung-fu de Hong Kong más famosas.", "Se usaron 120 cámaras sincronizadas para lograr un efecto de cámara lenta rotativa que revolucionó el cine de acción y fue copiado por todos.", "\"Yo sé kung-fu.\"", "Un programador descubre que la realidad es una simulación controlada por máquinas. Un grupo de rebeldes lo recluta porque creen que él es el elegido para liberar a la humanidad."]'::jsonb,
 ARRAY['ciencia ficción','acción'], 'Estados Unidos', 1990, 'Lana y Lilly Wachowski'),

('Coco', ARRAY['Coco Disney','Coco Pixar'], 'fácil', 'coco-2017',
 '["💀 🎸 🌺 👦 🌉", "El equipo de producción viajó múltiples veces al país donde transcurre y consultó con familias locales. Originalmente, el protagonista iba a ser un adulto.", "La canción principal fue escrita en media hora pero tardaron años en conseguir que el estudio no la cortara del guión.", "\"Recuérdame, aunque tenga que emigrar.\"", "Un niño que sueña con ser músico llega accidentalmente al mundo de los muertos en una celebración tradicional. Debe encontrar a su ancestro músico para volver al mundo de los vivos."]'::jsonb,
 ARRAY['animación','aventura','fantasía'], 'Estados Unidos', 2010, 'Lee Unkrich'),

-- MEDIO (6)
('Parásitos', ARRAY['Parasite','기생충','Gisaengchung'], 'medio', 'parasite-2019',
 '["🪨 🏠 🌧️ 📦 🪜", "El director construyó la casa rica y la casa pobre como sets completos. La inundación del sótano usó 264 toneladas de agua real.", "Fue la primera película no inglesa en ganar el premio más importante del cine mundial. El director también dirigió un thriller sobre un monstruo en un río.", "\"Son buenas personas porque son ricas.\"", "Una familia pobre se infiltra en el hogar de una familia adinerada, consiguiendo trabajos uno a uno. Pero un secreto oculto en el sótano desencadena una espiral violenta."]'::jsonb,
 ARRAY['drama','thriller'], 'Corea del Sur', 2010, 'Bong Joon-ho'),

('El Secreto de sus Ojos', ARRAY['El secreto de sus ojos','Secret in Their Eyes'], 'medio', 'the-secret-in-their-eyes-2009',
 '["👁️ ⚽ 💌 ⌨️ ⚖️", "La escena más famosa fue filmada en un estadio de fútbol real durante un partido. Usaron CGI para multiplicar la multitud pero los extras eran reales.", "Ganó el premio más importante para películas de habla no inglesa. Su director también hizo una película sobre un clan mafioso en un pueblo.", "\"Temo que, de todos mis miedos, el peor se haya hecho realidad.\"", "Un oficial de justicia retirado escribe una novela basada en un caso de asesinato que lo obsesionó durante 25 años, mientras lidia con un amor no correspondido por su antigua jefa."]'::jsonb,
 ARRAY['drama','thriller','misterio'], 'Argentina', 2000, 'Juan José Campanella'),

('Blade Runner 2049', ARRAY['Blade Runner 2','BR2049'], 'medio', 'blade-runner-2049',
 '["🌧️ 🤖 👁️ 🏜️ 🐝", "El director prohibió pantallas verdes y construyó sets masivos. La escena del desierto naranja usó luces LED reales, no efectos digitales.", "Fue un fracaso comercial a pesar de las críticas excelentes. El protagonista también interpreta a un replicante emocional en otra saga galáctica muy popular.", "\"Nacer es tener un alma.\"", "Un detective que se dedica a retirar modelos antiguos de seres artificiales descubre un secreto que podría destruir el orden social. Su búsqueda lo lleva a encontrar a un hombre desaparecido hace 30 años."]'::jsonb,
 ARRAY['ciencia ficción','drama','misterio'], 'Estados Unidos', 2010, 'Denis Villeneuve'),

('Relatos Salvajes', ARRAY['Relatos salvajes','Wild Tales'], 'medio', 'wild-tales',
 '["✈️ 🍽️ 🚗 💣 💒", "Todas las historias fueron escritas por la misma persona, pero se filmaron con equipos diferentes como si fueran cortometrajes independientes.", "Fue nominada al premio más importante del cine mundial para películas no inglesas. Uno de sus productores también produjo la película sobre un niño que habla con los muertos.", "\"¿Qué mirás?\"", "Seis historias independientes sobre personas comunes que llegan al límite y explotan de formas violentas e inesperadas: en un avión, un restaurante, una ruta, una grúa municipal, un accidente de auto y una boda."]'::jsonb,
 ARRAY['drama','comedia negra','thriller'], 'Argentina', 2010, 'Damián Szifron'),

('Eternal Sunshine of the Spotless Mind', ARRAY['Eterno resplandor de una mente sin recuerdos','Olvídate de mí','Eternal Sunshine'], 'medio', 'eternal-sunshine-of-the-spotless-mind',
 '["🧠 ❄️ 💙 🗑️ 🔄", "Muchas escenas se filmaron en orden inverso. Los actores principales no se habían visto antes del rodaje y su incomodidad real se usó para las primeras escenas.", "El guionista es conocido por escribir historias surrealistas sobre la mente humana. También escribió una película sobre un titiritero que encuentra un portal a la cabeza de un actor famoso.", "\"¿Puedo quedarme... aunque lo diga en serio?\"", "Tras una dolorosa ruptura, una pareja descubre que existe un procedimiento médico para borrar recuerdos específicos. Él decide borrarla a ella, pero durante el proceso se da cuenta de que no quiere olvidar."]'::jsonb,
 ARRAY['drama','romance','ciencia ficción'], 'Estados Unidos', 2000, 'Michel Gondry'),

('Ciudad de Dios', ARRAY['Cidade de Deus','City of God'], 'medio', 'city-of-god',
 '["📸 🔫 🏘️ 👦 🐔", "El 90% del elenco no eran actores profesionales sino habitantes reales de favelas. Hicieron un taller de actuación de 6 meses antes de filmar.", "El director usó diferentes estilos visuales para cada década que cubre la historia. La película cubre desde los años 60 hasta los 80 en la misma locación.", "\"Si corres, te atrapa. Si te quedas, te come.\"", "Un joven fotógrafo crece en un barrio marginal que se transforma en uno de los lugares más peligrosos de su ciudad. A través de su lente documenta el ascenso y caída de los narcotraficantes que controlan el lugar."]'::jsonb,
 ARRAY['drama','crimen'], 'Brasil', 2000, 'Fernando Meirelles'),

-- DIFÍCIL (4)
('Stalker', ARRAY['Сталкер'], 'difícil', 'stalker',
 '["🚪 🌿 💧 🐕 🔔", "El rodaje completo se hizo dos veces: la primera versión se perdió por un error de laboratorio que arruinó todo el material filmado.", "El director es considerado un poeta del cine. También dirigió una película sobre la infancia durante una guerra que usa espejos como metáfora.", "\"La debilidad es algo grande. La fuerza no es nada.\"", "Un guía lleva a un escritor y un científico a través de una zona prohibida y misteriosa donde supuestamente existe una habitación que cumple el deseo más íntimo de quien entra."]'::jsonb,
 ARRAY['ciencia ficción','drama'], 'Unión Soviética', 1970, 'Andrei Tarkovsky'),

('Yi Yi', ARRAY['A One and a Two','一一'], 'difícil', 'yi-yi',
 '["👨‍👩‍👧‍👦 📷 🏥 🎹 🔙", "El director nunca supervisaba el encuadre: confiaba completamente en su director de fotografía y solo miraba el resultado en postproducción.", "Es la última película de su director, quien decidió retirarse del cine después de completarla. Ganó el premio al mejor director en el festival europeo más prestigioso.", "\"¿No sería bueno poder vivir la vida dos veces?\"", "Una familia en una gran ciudad asiática atraviesa crisis simultáneas: la abuela en coma, el padre reencontrándose con un viejo amor, la hija con su primer novio y el hijo pequeño que fotografía las nucas de la gente."]'::jsonb,
 ARRAY['drama'], 'Taiwán', 2000, 'Edward Yang'),

('Come and See', ARRAY['Ven y mira','Idi i smotri','Masacre ven y mira'], 'difícil', 'come-and-see',
 '["👦 🔥 🌲 😱 ✝️", "Para lograr expresiones auténticas de terror, se usaron balas reales pasando cerca de los actores. El protagonista tenía 14 años durante el rodaje.", "La película fue prohibida por las autoridades durante años. El director tardó 8 años en conseguir permiso para filmarla.", "\"No hay que disparar. Las balas son caras.\"", "Un adolescente se une a los partisanos durante la invasión de su país en la Segunda Guerra Mundial. En pocos días, pasa de ser un niño entusiasta a un testigo del horror absoluto mientras su aldea y otras son arrasadas."]'::jsonb,
 ARRAY['drama','bélico'], 'Unión Soviética', 1980, 'Elem Klimov'),

('El Ángel Exterminador', ARRAY['The Exterminating Angel'], 'difícil', 'the-exterminating-angel',
 '["🚪 🍽️ 🐑 🔒 🎭", "El director filmó cada escena dos veces con ligeras variaciones y usó ambas en el montaje final, creando una sensación de repetición deliberada.", "Su director es uno de los grandes del cine surrealista. También cortó un ojo en una de sus películas más famosas, hecha con un pintor español célebre.", "\"La providencia no es ningún chistoso.\"", "Después de una cena elegante, los invitados descubren que son incapaces de salir del salón aunque no hay ningún obstáculo físico. Pasan días atrapados mientras la civilización se desmorona entre ellos."]'::jsonb,
 ARRAY['drama','surrealismo'], 'México', 1960, 'Luis Buñuel');
