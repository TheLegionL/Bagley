const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const MARKET_DATA_PATH = path.join(__dirname, '..', 'config', 'market-data.json');
const MARKET_STATE_PATH = path.join(__dirname, '..', 'config', 'market-state.json');
const MARKET_INVENTORIES_PATH = path.join(__dirname, '..', 'config', 'market-inventories.json');

// Categorie di mercato
const MARKET_CATEGORIES = {
  1: { name: 'Auto', subcategories: {} },
  2: { name: 'Proprietà', subcategories: {} },
  3: { name: 'Stocks', subcategories: {} },
  4: { name: 'Crypto', subcategories: {} },
  5: { name: 'Arte', subcategories: {} },
  6: { name: 'Monumenti', subcategories: {} },
  7: { name: 'Zozzap Custom Market', subcategories: {} }
};

// Dati di mercato iniziali
const INITIAL_MARKET_DATA = {
  // Auto - 10 produttori con 5 auto ciascuno
  1: {
    name: 'Auto',
    subcategories: {
      1: { name: 'Fiat', items: {
        '500': { name: 'Fiat 500 (500)', basePrice: 15000, volatility: 'low', description: 'Iconica city car italiana', maxAvailable: 8 },
        'panda': { name: 'Fiat Panda (panda)', basePrice: 12000, volatility: 'low', description: 'Utilitaria affidabile', maxAvailable: 10 },
        'tipo': { name: 'Fiat Tipo (tipo)', basePrice: 18000, volatility: 'medium', description: 'Berlina compatta', maxAvailable: 6 },
        '500x': { name: 'Fiat 500X (500x)', basePrice: 22000, volatility: 'medium', description: 'SUV compatto', maxAvailable: 5 },
        '500e': { name: 'Fiat 500e (500e)', basePrice: 35000, volatility: 'high', description: 'Versione elettrica della 500', maxAvailable: 3 }
      }},
      2: { name: 'BMW', items: {
        '118i': { name: 'BMW 118i (118i)', basePrice: 28000, volatility: 'medium', description: 'Compatta premium', maxAvailable: 6 },
        '320i': { name: 'BMW 320i (320i)', basePrice: 35000, volatility: 'medium', description: 'Berlina media', maxAvailable: 7 },
        'x3': { name: 'BMW X3 (x3)', basePrice: 45000, volatility: 'high', description: 'SUV di lusso', maxAvailable: 5 },
        '330e': { name: 'BMW 330e (330e)', basePrice: 42000, volatility: 'high', description: 'Ibrida plug-in', maxAvailable: 4 },
        'm3': { name: 'BMW M3 (m3)', basePrice: 75000, volatility: 'high', description: 'Sportiva ad alte prestazioni', maxAvailable: 2 }
      }},
      3: { name: 'Mercedes', items: {
        'a180': { name: 'Mercedes A180 (a180)', basePrice: 32000, volatility: 'medium', description: 'Compatta di lusso', maxAvailable: 5 },
        'c200': { name: 'Mercedes C200 (c200)', basePrice: 42000, volatility: 'medium', description: 'Berlina executive', maxAvailable: 6 },
        'gle': { name: 'Mercedes GLE (gle)', basePrice: 65000, volatility: 'high', description: 'SUV di lusso', maxAvailable: 4 },
        'e300e': { name: 'Mercedes E300e (e300e)', basePrice: 55000, volatility: 'high', description: 'Ibrida di lusso', maxAvailable: 3 },
        's500': { name: 'Mercedes S500 (s500)', basePrice: 95000, volatility: 'high', description: 'Limousine di lusso', maxAvailable: 1 }
      }},
      4: { name: 'Audi', items: {
        'a3': { name: 'Audi A3 (a3)', basePrice: 29000, volatility: 'medium', description: 'Compatta premium', maxAvailable: 7 },
        'a4': { name: 'Audi A4 (a4)', basePrice: 38000, volatility: 'medium', description: 'Berlina media', maxAvailable: 6 },
        'q5': { name: 'Audi Q5 (q5)', basePrice: 48000, volatility: 'high', description: 'SUV premium', maxAvailable: 5 },
        'a6': { name: 'Audi A6 (a6)', basePrice: 52000, volatility: 'high', description: 'Berlina executive', maxAvailable: 4 },
        'rs6': { name: 'Audi RS6 (rs6)', basePrice: 110000, volatility: 'high', description: 'Station wagon sportiva', maxAvailable: 1 }
      }},
      5: { name: 'Volkswagen', items: {
        'polo': { name: 'Volkswagen Polo (polo)', basePrice: 16000, volatility: 'low', description: 'Utilitaria tedesca', maxAvailable: 12 },
        'golf': { name: 'Volkswagen Golf (golf)', basePrice: 22000, volatility: 'medium', description: 'Compatta versatile', maxAvailable: 10 },
        'passat': { name: 'Volkswagen Passat (passat)', basePrice: 28000, volatility: 'medium', description: 'Berlina familiare', maxAvailable: 7 },
        'tiguan': { name: 'Volkswagen Tiguan (tiguan)', basePrice: 32000, volatility: 'medium', description: 'SUV compatto', maxAvailable: 8 },
        'arteon': { name: 'Volkswagen Arteon (arteon)', basePrice: 38000, volatility: 'high', description: 'Coupé a 4 porte', maxAvailable: 3 }
      }},
      6: { name: 'Toyota', items: {
        'yaris': { name: 'Toyota Yaris (yaris)', basePrice: 14000, volatility: 'low', description: 'City car affidabile', maxAvailable: 15 },
        'corolla': { name: 'Toyota Corolla (corolla)', basePrice: 20000, volatility: 'medium', description: 'Berlina compatta', maxAvailable: 12 },
        'camry': { name: 'Toyota Camry (camry)', basePrice: 28000, volatility: 'medium', description: 'Berlina media', maxAvailable: 8 },
        'rav4': { name: 'Toyota RAV4 (rav4)', basePrice: 32000, volatility: 'medium', description: 'SUV compatto', maxAvailable: 10 },
        'prius': { name: 'Toyota Prius (prius)', basePrice: 26000, volatility: 'high', description: 'Ibrida rivoluzionaria', maxAvailable: 6 }
      }},
      7: { name: 'Honda', items: {
        'jazz': { name: 'Honda Jazz (jazz)', basePrice: 15000, volatility: 'low', description: 'Utilitaria giapponese', maxAvailable: 9 },
        'civic': { name: 'Honda Civic (civic)', basePrice: 22000, volatility: 'medium', description: 'Berlina compatta', maxAvailable: 8 },
        'accord': { name: 'Honda Accord (accord)', basePrice: 28000, volatility: 'medium', description: 'Berlina media', maxAvailable: 6 },
        'crv': { name: 'Honda CR-V (crv)', basePrice: 30000, volatility: 'medium', description: 'SUV compatto', maxAvailable: 9 },
        'nsx': { name: 'Honda NSX (nsx)', basePrice: 180000, volatility: 'high', description: 'Supercar ibrida', maxAvailable: 1 }
      }},
      8: { name: 'Ford', items: {
        'fiesta': { name: 'Ford Fiesta (fiesta)', basePrice: 13000, volatility: 'low', description: 'Utilitaria americana', maxAvailable: 11 },
        'focus': { name: 'Ford Focus (focus)', basePrice: 19000, volatility: 'medium', description: 'Compatta versatile', maxAvailable: 9 },
        'mondeo': { name: 'Ford Mondeo (mondeo)', basePrice: 25000, volatility: 'medium', description: 'Berlina familiare', maxAvailable: 6 },
        'kuga': { name: 'Ford Kuga (kuga)', basePrice: 28000, volatility: 'medium', description: 'SUV compatto', maxAvailable: 7 },
        'mustang': { name: 'Ford Mustang (mustang)', basePrice: 45000, volatility: 'high', description: 'Muscle car iconica', maxAvailable: 2 }
      }},
      9: { name: 'Tesla', items: {
        'model3': { name: 'Tesla Model 3 (model3)', basePrice: 45000, volatility: 'high', description: 'Berlina elettrica', maxAvailable: 20 },
        'modelY': { name: 'Tesla Model Y (modelY)', basePrice: 52000, volatility: 'high', description: 'SUV elettrico', maxAvailable: 18 },
        'models': { name: 'Tesla Model S (models)', basePrice: 85000, volatility: 'high', description: 'Sedan di lusso elettrica', maxAvailable: 12 },
        'modelx': { name: 'Tesla Model X (modelx)', basePrice: 95000, volatility: 'high', description: 'SUV di lusso elettrico', maxAvailable: 10 },
        'cybertruck': { name: 'Tesla Cybertruck (cybertruck)', basePrice: 55000, volatility: 'high', description: 'Pick-up futuristico', maxAvailable: 8 }
      }},
      10: { name: 'Ferrari', items: {
        'roma': { name: 'Ferrari Roma (roma)', basePrice: 220000, volatility: 'high', description: 'Gran turismo elegante', maxAvailable: 1 },
        'portofino': { name: 'Ferrari Portofino (portofino)', basePrice: 250000, volatility: 'high', description: 'Spider sportiva', maxAvailable: 1 },
        '488': { name: 'Ferrari 488 (488)', basePrice: 350000, volatility: 'high', description: 'Supercar V8', maxAvailable: 1 },
        'f8': { name: 'Ferrari F8 (f8)', basePrice: 380000, volatility: 'high', description: 'Supercar ibrida', maxAvailable: 1 },
        'sf90': { name: 'Ferrari SF90 (sf90)', basePrice: 500000, volatility: 'high', description: 'Hypercar ibrida', maxAvailable: 1 }
      }}
    }
  },

  // Proprietà - 15 proprietà fittizie
  2: {
    name: 'Proprietà',
    subcategories: {
      1: { name: 'Appartamenti Milano', items: {
        'app_milano_centro': { name: 'Appartamento Centro Milano (app_milano_centro)', basePrice: 500000, volatility: 'medium', description: 'Appartamento 100mq in centro storico', maxAvailable: 5 },
        'app_milano_navigli': { name: 'Appartamento Navigli Milano (app_milano_navigli)', basePrice: 350000, volatility: 'medium', description: 'Loft 80mq nei Navigli', maxAvailable: 5 },
        'app_milano_isola': { name: 'Appartamento Isola Milano (app_milano_isola)', basePrice: 450000, volatility: 'high', description: 'Attico 120mq nell\'Isola', maxAvailable: 5 },
        'app_milano_brera': { name: 'Appartamento Brera Milano (app_milano_brera)', basePrice: 600000, volatility: 'high', description: 'Palazzo storico 150mq in Brera', maxAvailable: 5 },
        'app_milano_citylife': { name: 'Appartamento CityLife Milano (app_milano_citylife)', basePrice: 700000, volatility: 'high', description: 'Penthouse 200mq a CityLife', maxAvailable: 5 }
      }},
      2: { name: 'Ville Roma', items: {
        'villa_roma_trastevere': { name: 'Villa Trastevere Roma (villa_roma_trastevere)', basePrice: 800000, volatility: 'medium', description: 'Villa 300mq con giardino a Trastevere', maxAvailable: 5 },
        'villa_roma_monteverde': { name: 'Villa Monteverde Roma (villa_roma_monteverde)', basePrice: 650000, volatility: 'medium', description: 'Villa bifamiliare 250mq', maxAvailable: 5 },
        'villa_roma_eur': { name: 'Villa EUR Roma (villa_roma_eur)', basePrice: 750000, volatility: 'high', description: 'Villa moderna 280mq nell\'EUR', maxAvailable: 5 },
        'villa_roma_olgiata': { name: 'Villa Olgiata Roma (villa_roma_olgiata)', basePrice: 1200000, volatility: 'high', description: 'Villa di lusso 400mq con piscina', maxAvailable: 5 },
        'villa_roma_appia': { name: 'Villa Appia Antica Roma (villa_roma_appia)', basePrice: 900000, volatility: 'high', description: 'Villa storica 350mq sull\'Appia Antica', maxAvailable: 5 }
      }},
      3: { name: 'Case Firenze', items: {
        'casa_firenze_oltrarno': { name: 'Casa Oltrarno Firenze (casa_firenze_oltrarno)', basePrice: 550000, volatility: 'medium', description: 'Casa 180mq in Oltrarno', maxAvailable: 5 },
        'casa_firenze_santa_croce': { name: 'Casa Santa Croce Firenze (casa_firenze_santa_croce)', basePrice: 480000, volatility: 'medium', description: 'Appartamento 140mq in Santa Croce', maxAvailable: 5 },
        'casa_firenze_boboli': { name: 'Casa Boboli Firenze (casa_firenze_boboli)', basePrice: 850000, volatility: 'high', description: 'Villa 300mq vicino ai Boboli', maxAvailable: 5 },
        'casa_firenze_piazza_signoria': { name: 'Casa Piazza Signoria Firenze (casa_firenze_piazza_signoria)', basePrice: 1200000, volatility: 'high', description: 'Palazzo storico 400mq', maxAvailable: 5 },
        'casa_firenze_fiesole': { name: 'Casa Fiesole Firenze (casa_firenze_fiesole)', basePrice: 650000, volatility: 'high', description: 'Villa 250mq a Fiesole', maxAvailable: 5 }
      }}
    }
  },

  // Stocks - 15 titoli reali
  3: {
    name: 'Stocks',
    subcategories: {
      1: { name: 'Tecnologia', items: {
        'AAPL': { name: 'Apple Inc. (AAPL)', basePrice: 180, volatility: 'high', description: 'Leader mondiale in dispositivi elettronici', maxAvailable: 500 },
        'MSFT': { name: 'Microsoft Corporation (MSFT)', basePrice: 380, volatility: 'high', description: 'Software e cloud computing', maxAvailable: 450 },
        'GOOGL': { name: 'Alphabet Inc. (GOOGL)', basePrice: 140, volatility: 'high', description: 'Motore di ricerca e pubblicità online', maxAvailable: 480 },
        'AMZN': { name: 'Amazon.com Inc. (AMZN)', basePrice: 155, volatility: 'high', description: 'E-commerce e servizi cloud', maxAvailable: 460 },
        'TSLA': { name: 'Tesla Inc. (TSLA)', basePrice: 220, volatility: 'high', description: 'Veicoli elettrici e energia rinnovabile', maxAvailable: 350 }
      }},
      2: { name: 'Finanza', items: {
        'JPM': { name: 'JPMorgan Chase & Co. (JPM)', basePrice: 160, volatility: 'medium', description: 'Banca d\'investimento globale', maxAvailable: 420 },
        'BAC': { name: 'Bank of America Corp. (BAC)', basePrice: 35, volatility: 'medium', description: 'Servizi bancari retail', maxAvailable: 600 },
        'WFC': { name: 'Wells Fargo & Co. (WFC)', basePrice: 45, volatility: 'medium', description: 'Banca commerciale americana', maxAvailable: 380 },
        'GS': { name: 'Goldman Sachs Group Inc. (GS)', basePrice: 380, volatility: 'high', description: 'Investment banking', maxAvailable: 150 },
        'MS': { name: 'Morgan Stanley (MS)', basePrice: 85, volatility: 'medium', description: 'Gestione patrimoniale e investment banking', maxAvailable: 320 }
      }},
      3: { name: 'Energia', items: {
        'XOM': { name: 'Exxon Mobil Corp. (XOM)', basePrice: 110, volatility: 'medium', description: 'Petrolio e gas naturale', maxAvailable: 280 },
        'CVX': { name: 'Chevron Corporation (CVX)', basePrice: 155, volatility: 'medium', description: 'Energia e prodotti chimici', maxAvailable: 250 },
        'COP': { name: 'ConocoPhillips (COP)', basePrice: 110, volatility: 'high', description: 'Esplorazione petrolifera', maxAvailable: 200 },
        'ENB': { name: 'Enbridge Inc. (ENB)', basePrice: 35, volatility: 'low', description: 'Oleodotti e gasdotti', maxAvailable: 400 },
        'SLB': { name: 'Schlumberger Ltd. (SLB)', basePrice: 45, volatility: 'high', description: 'Servizi petroliferi', maxAvailable: 220 }
      }}
    }
  },

  // Crypto - 15 cryptovalute reali
  4: {
    name: 'Crypto',
    subcategories: {
      1: { name: 'Major Coins', items: {
        'BTC': { name: 'Bitcoin (BTC)', basePrice: 45000, volatility: 'high', description: 'La criptovaluta originale', maxAvailable: 21000000 },
        'ETH': { name: 'Ethereum (ETH)', basePrice: 2800, volatility: 'high', description: 'Smart contracts platform', maxAvailable: 120000000 },
        'BNB': { name: 'Binance Coin (BNB)', basePrice: 320, volatility: 'high', description: 'Token dell\'exchange Binance', maxAvailable: 200000000 },
        'ADA': { name: 'Cardano (ADA)', basePrice: 0.45, volatility: 'high', description: 'Blockchain proof-of-stake', maxAvailable: 45000000000 },
        'SOL': { name: 'Solana (SOL)', basePrice: 95, volatility: 'high', description: 'High-performance blockchain', maxAvailable: 425000000 }
      }},
      2: { name: 'DeFi Tokens', items: {
        'UNI': { name: 'Uniswap (UNI)', basePrice: 6.5, volatility: 'high', description: 'Decentralized exchange protocol', maxAvailable: 1000000000 },
        'AAVE': { name: 'Aave (AAVE)', basePrice: 85, volatility: 'high', description: 'Decentralized lending protocol', maxAvailable: 16000000 },
        'COMP': { name: 'Compound (COMP)', basePrice: 55, volatility: 'high', description: 'Algorithmic money markets', maxAvailable: 10000000 },
        'MKR': { name: 'Maker (MKR)', basePrice: 1200, volatility: 'high', description: 'Decentralized stablecoin platform', maxAvailable: 1000000 },
        'SUSHI': { name: 'SushiSwap (SUSHI)', basePrice: 1.2, volatility: 'high', description: 'Decentralized exchange', maxAvailable: 250000000 }
      }},
      3: { name: 'Meme Coins', items: {
        'DOGE': { name: 'Dogecoin (DOGE)', basePrice: 0.08, volatility: 'high', description: 'Meme coin ispirata a Doge', maxAvailable: 132000000000 },
        'SHIB': { name: 'Shiba Inu (SHIB)', basePrice: 0.00001, volatility: 'high', description: 'Meme coin ispirata a Shiba Inu', maxAvailable: 589000000000000 },
        'PEPE': { name: 'Pepe (PEPE)', basePrice: 0.000001, volatility: 'high', description: 'Meme coin ispirata a Pepe the Frog', maxAvailable: 420000000000000 },
        'FLOKI': { name: 'Floki Inu (FLOKI)', basePrice: 0.00003, volatility: 'high', description: 'Meme coin ispirata a Floki', maxAvailable: 10000000000000 },
        'BONK': { name: 'Bonk (BONK)', basePrice: 0.0000002, volatility: 'high', description: 'Meme coin del Solana ecosystem', maxAvailable: 100000000000000000 }
      }}
    }
  },

  // Arte - 15 oggetti d'arte reali
  5: {
    name: 'Arte',
    subcategories: {
      1: { name: 'Dipinti', items: {
        'mona_lisa': { name: 'La Gioconda - Leonardo da Vinci (mona_lisa)', basePrice: 850000000, volatility: 'high', description: 'Il dipinto più famoso del mondo', maxAvailable: 1 },
        'notte_stellata': { name: 'La Notte Stellata - Vincent van Gogh (notte_stellata)', basePrice: 100000000, volatility: 'high', description: 'Opera post-impressionista', maxAvailable: 1 },
        'urlo': { name: 'L\'Urlo - Edvard Munch (urlo)', basePrice: 120000000, volatility: 'high', description: 'Espressionismo norvegese', maxAvailable: 1 },
        'guernica': { name: 'Guernica - Pablo Picasso (guernica)', basePrice: 200000000, volatility: 'high', description: 'Anti-guerra cubista', maxAvailable: 1 },
        'nascita_venere': { name: 'La Nascita di Venere - Sandro Botticelli (nascita_venere)', basePrice: 500000000, volatility: 'high', description: 'Rinascimento italiano', maxAvailable: 1 }
      }},
      2: { name: 'Sculture', items: {
        'david': { name: 'David - Michelangelo (david)', basePrice: 300000000, volatility: 'medium', description: 'Scultura rinascimentale', maxAvailable: 1 },
        'pensatore': { name: 'Il Pensatore - Auguste Rodin (pensatore)', basePrice: 15000000, volatility: 'medium', description: 'Bronzo simbolista', maxAvailable: 1 },
        'bacio': { name: 'Il Bacio - Auguste Rodin (bacio)', basePrice: 18000000, volatility: 'medium', description: 'Scultura romantica', maxAvailable: 1 },
        'madre_patrone': { name: 'Madre e Patrone - Henry Moore (madre_patrone)', basePrice: 25000000, volatility: 'high', description: 'Scultura moderna', maxAvailable: 1 },
        'uccello_pace': { name: 'Uccello della Pace - Pablo Picasso (uccello_pace)', basePrice: 30000000, volatility: 'high', description: 'Scultura cubista', maxAvailable: 1 }
      }},
      3: { name: 'Fotografia', items: {
        'afghan_girl': { name: 'Ragazza Afghana - Steve McCurry (afghan_girl)', basePrice: 150000, volatility: 'medium', description: 'Iconica foto di National Geographic', maxAvailable: 1 },
        'tank_man': { name: 'Tank Man - Jeff Widener (tank_man)', basePrice: 100000, volatility: 'medium', description: 'Simbolo della resistenza cinese', maxAvailable: 1 },
        'earthrise': { name: 'Earthrise - William Anders (earthrise)', basePrice: 200000, volatility: 'low', description: 'Prima foto della Terra dallo spazio', maxAvailable: 1 },
        'napalm_girl': { name: 'Napalm Girl - Nick Ut (napalm_girl)', basePrice: 120000, volatility: 'medium', description: 'Foto premio Pulitzer', maxAvailable: 1 },
        'vulture': { name: 'The Vulture and the Little Girl - Kevin Carter (vulture)', basePrice: 80000, volatility: 'low', description: 'Foto controversa premio Pulitzer', maxAvailable: 1 }
      }}
    }
  },

  // Monumenti - 15 monumenti reali
  6: {
    name: 'Monumenti',
    subcategories: {
      1: { name: 'Europa', items: {
        'colosseo': { name: 'Colosseo - Roma (colosseo)', basePrice: 5000000000, volatility: 'low', description: 'Anfiteatro romano simbolo dell\'Impero', maxAvailable: 1 },
        'torre_eiffel': { name: 'Torre Eiffel - Parigi (torre_eiffel)', basePrice: 3000000000, volatility: 'medium', description: 'Monumento simbolo di Parigi', maxAvailable: 1 },
        'big_ben': { name: 'Big Ben - Londra (big_ben)', basePrice: 2000000000, volatility: 'medium', description: 'Orologio simbolo del Regno Unito', maxAvailable: 1 },
        'sagrada_familia': { name: 'Sagrada Familia - Barcellona (sagrada_familia)', basePrice: 4000000000, volatility: 'high', description: 'Basilica modernista incompleta', maxAvailable: 1 },
        'acropoli': { name: 'Acropoli - Atene (acropoli)', basePrice: 1500000000, volatility: 'low', description: 'Cittadella antica greca', maxAvailable: 1 }
      }},
      2: { name: 'America', items: {
        'statua_liberta': { name: 'Statua della Libertà - New York (statua_liberta)', basePrice: 2500000000, volatility: 'medium', description: 'Simbolo della libertà americana', maxAvailable: 1 },
        'golden_gate': { name: 'Golden Gate Bridge - San Francisco (golden_gate)', basePrice: 1800000000, volatility: 'medium', description: 'Ponte iconico della California', maxAvailable: 1 },
        'mount_rushmore': { name: 'Mount Rushmore - Dakota del Sud (mount_rushmore)', basePrice: 1200000000, volatility: 'low', description: 'Memoriale dei presidenti scolpito nella roccia', maxAvailable: 1 },
        'washington_monument': { name: 'Washington Monument - Washington DC (washington_monument)', basePrice: 1000000000, volatility: 'low', description: 'Obelisco in onore di George Washington', maxAvailable: 1 },
        'lincoln_memorial': { name: 'Lincoln Memorial - Washington DC (lincoln_memorial)', basePrice: 900000000, volatility: 'low', description: 'Memoriale di Abraham Lincoln', maxAvailable: 1 }
      }},
      3: { name: 'Asia', items: {
        'grande_muro': { name: 'Grande Muro Cinese (grande_muro)', basePrice: 8000000000, volatility: 'low', description: 'Muro difensivo lungo migliaia di chilometri', maxAvailable: 1 },
        'taj_mahal': { name: 'Taj Mahal - India (taj_mahal)', basePrice: 3000000000, volatility: 'medium', description: 'Mausoleo di marmo bianco', maxAvailable: 1 },
        'tempio_cielo': { name: 'Tempio del Cielo - Pechino (tempio_cielo)', basePrice: 1500000000, volatility: 'low', description: 'Complesso architettonico imperiale', maxAvailable: 1 },
        'borobudur': { name: 'Borobudur - Indonesia (borobudur)', basePrice: 1200000000, volatility: 'low', description: 'Tempio buddista più grande del mondo', maxAvailable: 1 },
        'petra': { name: 'Petra - Giordania (petra)', basePrice: 2000000000, volatility: 'medium', description: 'Città scavata nella roccia', maxAvailable: 1 }
      }}
    }
  },

  // Zozzap Custom Market - Vuoto per ora
  7: {
    name: 'Zozzap Custom Market',
    subcategories: {}
  }
};

class MarketService {
  constructor({ logger, bankService }) {
    this.logger = logger;
    this.bankService = bankService;
    this.marketData = INITIAL_MARKET_DATA;
    this.marketState = {};
    this.inventories = {};
    this.dailyUpdateInterval = null;
  }

  async initialize() {
    await this.loadMarketData();
    await this.loadMarketState();
    await this.loadInventories();

    // Calcola la data dell'ultimo giorno salvato
    let lastSavedDate = null;
    for (const categoryId in this.marketState) {
      for (const subId in this.marketState[categoryId]) {
        for (const itemId in this.marketState[categoryId][subId]) {
          const days = Object.keys(this.marketState[categoryId][subId][itemId]);
          for (const d of days) {
            if (!lastSavedDate || d > lastSavedDate) lastSavedDate = d;
          }
        }
      }
    }
    const today = new Date().toISOString().split('T')[0];
    // Se marketState è vuoto o non aggiornato fino a oggi, aggiorna tutti i giorni mancanti
    if (!lastSavedDate || lastSavedDate < today) {
      this.logger?.info('Updating market for missing days...');
      await this.updatePricesFillMissing(lastSavedDate, today);
    }

    this.startDailyUpdates();
    this.logger?.info('Market service initialized');
  }
  // Aggiorna i prezzi per tutti i giorni mancanti tra lastSavedDate (YYYY-MM-DD) e today (YYYY-MM-DD)
  async updatePricesFillMissing(lastSavedDate, today) {
    // Se lastSavedDate è nullo, aggiorna solo oggi
    let startDate = lastSavedDate ? new Date(lastSavedDate) : new Date(today);
    if (!lastSavedDate) startDate.setDate(startDate.getDate() - 1); // solo oggi
    const endDate = new Date(today);
    // Avanza di un giorno rispetto all'ultimo salvato
    startDate.setDate(startDate.getDate() + 1);
    while (startDate <= endDate) {
      const dayStr = startDate.toISOString().split('T')[0];
      this.updatePrices(dayStr);
      startDate.setDate(startDate.getDate() + 1);
    }
    await this.saveMarketState();
  }

  async loadMarketData() {
    try {
      const data = await fs.readFile(MARKET_DATA_PATH, 'utf8');
      this.marketData = { ...INITIAL_MARKET_DATA, ...JSON.parse(data) };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger?.warn({ err: error }, 'Failed to load market data');
      }
      this.marketData = INITIAL_MARKET_DATA;
      await this.saveMarketData();
    }
  }

  async saveMarketData() {
    try {
      await fs.mkdir(path.dirname(MARKET_DATA_PATH), { recursive: true });
      await fs.writeFile(MARKET_DATA_PATH, JSON.stringify(this.marketData, null, 2));
    } catch (error) {
      this.logger?.error({ err: error }, 'Failed to save market data');
    }
  }

  async loadMarketState() {
    try {
      const data = await fs.readFile(MARKET_STATE_PATH, 'utf8');
      this.marketState = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger?.warn({ err: error }, 'Failed to load market state');
      }
      this.marketState = {};
      await this.saveMarketState();
    }
  }

  async saveMarketState() {
    try {
      await fs.mkdir(path.dirname(MARKET_STATE_PATH), { recursive: true });
      await fs.writeFile(MARKET_STATE_PATH, JSON.stringify(this.marketState, null, 2));
    } catch (error) {
      this.logger?.error({ err: error }, 'Failed to save market state');
    }
  }

  async loadInventories() {
    try {
      const data = await fs.readFile(MARKET_INVENTORIES_PATH, 'utf8');
      this.inventories = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger?.warn({ err: error }, 'Failed to load inventories');
      }
      this.inventories = {};
      await this.saveInventories();
    }
  }

  async saveInventories() {
    try {
      await fs.mkdir(path.dirname(MARKET_INVENTORIES_PATH), { recursive: true });
      await fs.writeFile(MARKET_INVENTORIES_PATH, JSON.stringify(this.inventories, null, 2));
    } catch (error) {
      this.logger?.error({ err: error }, 'Failed to save inventories');
    }
  }

  startDailyUpdates() {
    // Aggiorna i prezzi ogni giorno alle 00:00
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = nextMidnight - now;

    setTimeout(() => {
      this.updatePrices();
      this.dailyUpdateInterval = setInterval(() => {
        this.updatePrices();
      }, 24 * 60 * 60 * 1000); // 24 ore
    }, timeUntilMidnight);
  }

  updatePrices() {
    this.updatePricesForDay();
  }

  // Aggiorna i prezzi per un giorno specifico (default oggi)
  updatePricesForDay(dayStr) {
    const today = dayStr || new Date().toISOString().split('T')[0];
    this.logger?.info('Updating market prices for ' + today);

    for (const categoryId in this.marketData) {
      const category = this.marketData[categoryId];
      for (const subId in category.subcategories) {
        const subcategory = category.subcategories[subId];
        for (const itemId in subcategory.items) {
          const item = subcategory.items[itemId];
          // Prendi il prezzo del giorno precedente, se esiste, altrimenti usa il basePrice
          let prevPrice = item.basePrice;
          // Trova il giorno precedente
          const prevDay = this.getPreviousMarketDay(today);
          if (prevDay) {
            const prev = this.marketState[categoryId]?.[subId]?.[itemId]?.[prevDay];
            if (typeof prev === 'number') prevPrice = prev;
          }
          const volatility = this.getVolatilityMultiplier(item.volatility);
          const change = (Math.random() - 0.5) * 2 * volatility; // -100% to +100% based on volatility
          const newPrice = Math.max(0.01, prevPrice * (1 + change));

          if (!this.marketState[categoryId]) this.marketState[categoryId] = {};
          if (!this.marketState[categoryId][subId]) this.marketState[categoryId][subId] = {};
          if (!this.marketState[categoryId][subId][itemId]) this.marketState[categoryId][subId][itemId] = {};

          this.marketState[categoryId][subId][itemId][today] = newPrice;
        }
      }
    }

    this.saveMarketState();
    this.logger?.info('Market prices updated');
  }

  // Trova il giorno precedente a dayStr (YYYY-MM-DD) nello storico, oppure ieri se non esiste
  getPreviousMarketDay(dayStr) {
    const d = new Date(dayStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  getVolatilityMultiplier(volatility) {
    switch (volatility) {
      case 'low': return 0.05; // ±5%
      case 'medium': return 0.15; // ±15%
      case 'high': return 0.30; // ±30%
      default: return 0.10;
    }
  }

  getCurrentPrice(categoryId, subId, itemId) {
    const catId = parseInt(categoryId);
    const subCatId = parseInt(subId);
    const catIdStr = String(catId);
    const subIdStr = String(subCatId); // Convert to string for subcategories key
    const today = new Date().toISOString().split('T')[0];
    const item = this.marketData[catIdStr]?.subcategories[subIdStr]?.items[itemId];

    if (!item) return 0;

    // Controlla se abbiamo un prezzo per oggi
    const todayPrice = this.marketState[catIdStr]?.[subIdStr]?.[itemId]?.[today];
    if (todayPrice) return todayPrice;

    // Altrimenti usa il prezzo base
    return item.basePrice;
  }

  getTrendingItems(limit = 10) {
    const items = [];
    const today = new Date().toISOString().split('T')[0];

    for (const categoryId in this.marketData) {
      const category = this.marketData[categoryId];
      for (const subId in category.subcategories) {
        const subcategory = category.subcategories[subId];
        for (const itemId in subcategory.items) {
          const item = subcategory.items[itemId];
          const currentPrice = this.getCurrentPrice(categoryId, subId, itemId);
          const basePrice = item.basePrice;
          const changePercent = ((currentPrice - basePrice) / basePrice) * 100;

          items.push({
            categoryId: parseInt(categoryId),
            subId: parseInt(subId),
            itemId,
            name: item.name,
            currentPrice,
            changePercent,
            volatility: item.volatility,
            description: item.description
          });
        }
      }
    }

    // Ordina per variazione percentuale assoluta (più volatili prima)
    return items
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, limit);
  }

  getCategoryItems(categoryId, limit = 10) {
    const items = [];
    const catId = String(categoryId); // Ensure string key for marketData
    const category = this.marketData[catId];
    if (!category) return items;

    for (const subId in category.subcategories) {
      const subcategory = category.subcategories[subId];
      for (const itemId in subcategory.items) {
        const item = subcategory.items[itemId];
        const currentPrice = this.getCurrentPrice(categoryId, subId, itemId);
        const basePrice = item.basePrice;
        const changePercent = ((currentPrice - basePrice) / basePrice) * 100;

        items.push({
          categoryId: parseInt(categoryId),
          subId: parseInt(subId),
          itemId,
          name: `${item.name} (${itemId})`,
          currentPrice,
          changePercent,
          volatility: item.volatility,
          description: item.description
        });
      }
    }

    return items.slice(0, limit);
  }

  getItemInfo(categoryId, subId, itemId) {
    const catId = parseInt(categoryId);
    const subCatId = parseInt(subId);
    const catIdStr = String(catId);
    const subIdStr = String(subCatId); // Convert to string for subcategories key
    const item = this.marketData[catIdStr]?.subcategories[subIdStr]?.items[itemId];
    if (!item) return null;

    const currentPrice = this.getCurrentPrice(catId, subCatId, itemId);
    const basePrice = item.basePrice;
    const changePercent = ((currentPrice - basePrice) / basePrice) * 100;

    return {
      categoryId: catId,
      subId: subCatId,
      itemId,
      name: `${item.name} (${itemId})`,
      currentPrice,
      basePrice,
      changePercent,
      volatility: item.volatility,
      description: item.description
    };
  }

  getUserInventory(userJid) {
    const normalizedJid = normalizeJid(userJid);
    return this.inventories[normalizedJid] || {};
  }

  async buyItem(userJid, categoryId, subId, itemId, quantity = 1) {
    const normalizedJid = normalizeJid(userJid);
    // Recupera il riferimento reale all'oggetto nel marketData per poter aggiornare maxAvailable
    const catIdStr = String(parseInt(categoryId));
    const subIdStr = String(parseInt(subId));
    const itemRef = this.marketData?.[catIdStr]?.subcategories?.[subIdStr]?.items?.[itemId];
    if (!itemRef) return { success: false, message: 'Oggetto non trovato' };

    // Controllo disponibilità
    if (typeof itemRef.maxAvailable === 'number') {
      if (itemRef.maxAvailable < quantity) {
        return { success: false, message: `Disponibilità esaurita: rimangono solo ${itemRef.maxAvailable}` };
      }
    }

    // Calcola prezzo attuale
    const item = this.getItemInfo(categoryId, subId, itemId);
    const totalCost = item.currentPrice * quantity;

    // Auto-crea account se non esiste
    let account = await this.bankService.getAccount(normalizedJid);
    if (!account) {
      const createResult = await this.bankService.createAccount(normalizedJid);
      if (createResult.error) {
        return { success: false, message: 'Errore nella creazione dell\'account bancario' };
      }
      account = createResult.account;
    }

    // Controlla se l'utente ha abbastanza soldi
    if (!account || !account.balance) {
      return { success: false, message: 'Account bancario non disponibile' };
    }
    if (account.balance < totalCost) {
      return { success: false, message: 'Saldo insufficiente' };
    }

    // Deduci i soldi
    await this.bankService.adjustBalance(normalizedJid, -totalCost);

    // Decrementa la disponibilità
    if (typeof itemRef.maxAvailable === 'number') {
      itemRef.maxAvailable -= quantity;
      if (itemRef.maxAvailable < 0) itemRef.maxAvailable = 0;
      await this.saveMarketData();
    }

    // Aggiungi all'inventario
    if (!this.inventories[normalizedJid]) {
      this.inventories[normalizedJid] = {};
    }
    const itemKey = `${categoryId}-${subId}-${itemId}`;
    if (!this.inventories[normalizedJid][itemKey]) {
      this.inventories[normalizedJid][itemKey] = {
        categoryId,
        subId,
        itemId,
        quantity: 0,
        totalInvested: 0
      };
    }

    this.inventories[normalizedJid][itemKey].quantity += quantity;
    this.inventories[normalizedJid][itemKey].totalInvested += totalCost;

    await this.saveInventories();

    return {
      success: true,
      message: `Acquistati ${quantity}x ${item.name} per ฿${totalCost.toLocaleString('it-IT')}`,
      item,
      quantity,
      totalCost
    };
  }

  async sellItem(userJid, categoryId, subId, itemId, quantity = 1) {
    const normalizedJid = normalizeJid(userJid);
    const item = this.getItemInfo(categoryId, subId, itemId);
    if (!item) return { success: false, message: 'Oggetto non trovato' };

    const itemKey = `${categoryId}-${subId}-${itemId}`;
    const userInventory = this.getUserInventory(normalizedJid);

    if (!userInventory[itemKey] || userInventory[itemKey].quantity < quantity) {
      return { success: false, message: 'Quantità insufficiente in inventario' };
    }

    const totalRevenue = item.currentPrice * quantity;

    // Auto-crea account se non esiste (per sicurezza)
    let account = await this.bankService.getAccount(normalizedJid);
    if (!account) {
      const createResult = await this.bankService.createAccount(normalizedJid);
      if (createResult.error) {
        return { success: false, message: 'Errore nella creazione dell\'account bancario' };
      }
      account = createResult.account;
    }

    // Aggiungi i soldi
    await this.bankService.adjustBalance(normalizedJid, totalRevenue);

    // Rimuovi dall'inventario
    userInventory[itemKey].quantity -= quantity;
    if (userInventory[itemKey].quantity <= 0) {
      delete userInventory[itemKey];
    }

    await this.saveInventories();

    return {
      success: true,
      message: `Venduti ${quantity}x ${item.name} per ฿${totalRevenue.toLocaleString('it-IT')}`,
      item,
      quantity,
      totalRevenue
    };
  }

  getCategories() {
    return MARKET_CATEGORIES;
  }

  getSubcategories(categoryId) {
    const catId = String(categoryId); // Ensure string key for marketData
    const category = this.marketData[catId];
    if (!category) return {};
    return category.subcategories || {};
  }

  getSubcategoryItems(categoryId, subId, limit = 10) {
    const items = [];
    const catId = parseInt(categoryId);
    const subCatId = parseInt(subId);
    const catIdStr = String(catId);
    const subIdStr = String(subCatId); // Convert to string for subcategories key
    const sub = this.marketData[catIdStr]?.subcategories[subIdStr];
    if (!sub) return items;
    for (const itemId in sub.items) {
      const item = sub.items[itemId];
      const currentPrice = this.getCurrentPrice(catId, subCatId, itemId);
      const basePrice = item.basePrice;
      const changePercent = ((currentPrice - basePrice) / basePrice) * 100;
      items.push({
        categoryId: catId,
        subId: subCatId,
        itemId,
        name: `${item.name} (${itemId})`,
        currentPrice,
        changePercent,
        volatility: item.volatility,
        description: item.description
      });
    }
    return items.slice(0, limit);
  }

  getCategoryName(categoryId) {
    return MARKET_CATEGORIES[parseInt(categoryId)]?.name || 'Categoria sconosciuta';
  }

  getSubcategoryName(categoryId, subId) {
    const catId = String(categoryId);
    const subCatId = String(subId);
    return this.marketData[catId]?.subcategories[subCatId]?.name || 'Sottocategoria sconosciuta';
  }

  findItemByName(name) {
    for (const catId in this.marketData) {
      const category = this.marketData[catId];
      for (const subId in category.subcategories) {
        const subcategory = category.subcategories[subId];
        for (const itemId in subcategory.items) {
          const item = subcategory.items[itemId];
          if (item.name.toLowerCase().includes(name.toLowerCase())) {
            return {
              categoryId: parseInt(catId),
              subId: parseInt(subId),
              itemId,
              name: item.name
            };
          }
        }
      }
    }
    return null;
  }

  findItemInCategory(categoryId, itemName) {
    const catId = String(categoryId);
    const category = this.marketData[catId];
    if (!category) return null;
    for (const subId in category.subcategories) {
      const subcategory = category.subcategories[subId];
      for (const itemId in subcategory.items) {
        const item = subcategory.items[itemId];
        if (item.name.toLowerCase() === itemName.toLowerCase()) {
          return {
            categoryId: parseInt(catId),
            subId: parseInt(subId),
            itemId,
            name: item.name
          };
        }
      }
    }
    return null;
  }

  // Trasferisci un oggetto da un utente a un altro (scambio semplice)
  async transferItem(fromJid, toJid, categoryId, subId, itemId, quantity = 1) {
    const fromNormalized = normalizeJid(fromJid);
    const toNormalized = normalizeJid(toJid);

    if (fromNormalized === toNormalized) {
      return { success: false, message: 'Non puoi scambiare con te stesso!' };
    }

    const fromInventory = this.getUserInventory(fromNormalized);
    const itemKey = `${categoryId}-${subId}-${itemId}`;

    if (!fromInventory[itemKey] || fromInventory[itemKey].quantity < quantity) {
      return { success: false, message: 'Non hai abbastanza di questo oggetto' };
    }

    const item = this.getItemInfo(categoryId, subId, itemId);
    if (!item) return { success: false, message: 'Oggetto non trovato' };

    // Rimuovi dal mittente
    fromInventory[itemKey].quantity -= quantity;
    if (fromInventory[itemKey].quantity <= 0) {
      delete fromInventory[itemKey];
    }

    // Aggiungi al destinatario
    if (!this.inventories[toNormalized]) {
      this.inventories[toNormalized] = {};
    }
    if (!this.inventories[toNormalized][itemKey]) {
      this.inventories[toNormalized][itemKey] = {
        categoryId,
        subId,
        itemId,
        quantity: 0,
        totalInvested: 0
      };
    }
    this.inventories[toNormalized][itemKey].quantity += quantity;

    await this.saveInventories();

    return {
      success: true,
      message: `${quantity}x ${item.name} trasferito a ${toJid}`,
      item,
      quantity
    };
  }

  // Regala un oggetto a un altro utente
  async giftItem(fromJid, toJid, categoryId, subId, itemId, quantity = 1) {
    return this.transferItem(fromJid, toJid, categoryId, subId, itemId, quantity);
  }

  // Vendi un oggetto a un altro utente per denaro
  async sellToUser(sellerJid, buyerJid, categoryId, subId, itemId, quantity = 1, price) {
    const sellerNormalized = normalizeJid(sellerJid);
    const buyerNormalized = normalizeJid(buyerJid);

    if (sellerNormalized === buyerNormalized) {
      return { success: false, message: 'Non puoi vendere a te stesso!' };
    }

    const totalCost = price * quantity;

    // Controlla saldo dell'acquirente
    let buyerAccount = await this.bankService.getAccount(buyerNormalized);
    if (!buyerAccount) {
      const createResult = await this.bankService.createAccount(buyerNormalized);
      if (createResult.error) {
        return { success: false, message: 'Errore nella creazione dell\'account dell\'acquirente' };
      }
      buyerAccount = createResult.account;
    }

    if (buyerAccount.balance < totalCost) {
      return { success: false, message: `L'acquirente non ha abbastanza soldi (servono ฿${totalCost.toLocaleString('it-IT')})` };
    }

    // Trasferisci l'oggetto
    const transferResult = await this.transferItem(sellerNormalized, buyerNormalized, categoryId, subId, itemId, quantity);
    if (!transferResult.success) {
      return transferResult;
    }

    // Trasferisci il denaro
    await this.bankService.adjustBalance(buyerNormalized, -totalCost);
    await this.bankService.adjustBalance(sellerNormalized, totalCost);

    const item = this.getItemInfo(categoryId, subId, itemId);

    return {
      success: true,
      message: `Venduto ${quantity}x ${item.name} per ฿${totalCost.toLocaleString('it-IT')}`,
      item,
      quantity,
      totalCost
    };
  }
}

async function createMarketService({ logger, bankService }) {
  const service = new MarketService({ logger, bankService });
  await service.initialize();
  return service;
}

module.exports = {
  createMarketService
};