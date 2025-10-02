import { useState, type FC, type ComponentType, type SVGProps } from 'react';
import { Trophy, Brain, Globe, BookOpen, Lightbulb, AlertCircle } from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
}

interface Question {
  domanda: string;
  risposte: string[];
  corretta: number;
}

const App: FC = () => {
  const [level, setLevel] = useState<number>(1);
  const [apiKey, setApiKey] = useState<string>('');
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [answered, setAnswered] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModelResource, setSelectedModelResource] = useState<string>('models/gemini-1.5-flash');

  const topics: Topic[] = [
    { id: 'matematica', name: 'Matematica', icon: Brain, color: 'bg-blue-500' },
    { id: 'geografia', name: 'Geografia', icon: Globe, color: 'bg-green-500' },
    { id: 'storia', name: 'Storia', icon: BookOpen, color: 'bg-purple-500' },
    { id: 'cultura', name: 'Cultura Generale', icon: Lightbulb, color: 'bg-yellow-500' }
  ];

  const getDifficulty = (lvl: number): string => {
    if (lvl <= 5) return 'facile';
    if (lvl <= 10) return 'media';
    if (lvl <= 15) return 'difficile';
    return 'molto difficile';
  };

  const generateQuestion = async (topic: string) => {
    setLoading(true);
    setMessage('');
    
    try {
      const difficulty = getDifficulty(level);
      const found = topics.find(t => t.id === topic);
      const topicName = found ? found.name : topic;
      
      const prompt = `Genera una domanda di ${topicName} di difficoltà ${difficulty} (livello ${level}/20).
      
Rispondi SOLO con un oggetto JSON valido in questo formato esatto:
{
  "domanda": "testo della domanda",
  "risposte": ["risposta1", "risposta2", "risposta3", "risposta4"],
  "corretta": 0
}

dove "corretta" è l'indice (0-3) della risposta corretta nell'array "risposte".
Non aggiungere testo prima o dopo il JSON.`;

  // Use the selected model resource (example: 'models/gemini-1.5-flash')
  const modelResource = selectedModelResource || 'models/gemini-1.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1/${modelResource}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 500
          }
        })
      });

      if (!response.ok) {
        // Try to parse JSON error, otherwise fallback to raw text for better debugging
        let errMessage = 'Errore nella chiamata API';
        try {
          const errorData = await response.json();
          errMessage = errorData.error?.message || JSON.stringify(errorData);
        } catch (e) {
          const text = await response.text();
          errMessage = text || errMessage;
        }
        throw new Error(errMessage);
      }

      const data = await response.json();

      // Try multiple paths where the model text might be present to be resilient
      let content: string | undefined;

      try {
        // Old-style response shape
        content = data?.candidates?.[0]?.content?.[0]?.parts?.[0]?.text
          || data?.candidates?.[0]?.content?.parts?.[0]?.text
          // Newer shapes used by some SDKs
          || data?.output?.[0]?.content?.find((c: any) => c.type === 'text')?.text
          // direct text fields
          || data?.text
          || data?.outputs?.[0]?.content?.[0]?.text;
      } catch (e) {
        content = undefined;
      }

      if (!content) {
        // If we didn't find a text field, surface the full response for debugging
        throw new Error('Impossibile trovare il testo nella risposta API. Response: ' + JSON.stringify(data));
      }

      // Rimuovi eventuali markdown code blocks
      const jsonContent = String(content).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let questionData: Question;
      try {
        questionData = JSON.parse(jsonContent);
      } catch (e) {
        throw new Error('Errore parsing JSON della risposta: ' + (e instanceof Error ? e.message : String(e)) + '\nContenuto ricevuto: ' + jsonContent);
      }

      // Basic validation of shape
      if (!questionData || typeof questionData.domanda !== 'string' || !Array.isArray(questionData.risposte) || typeof questionData.corretta !== 'number') {
        throw new Error('La risposta JSON non ha il formato atteso. Ricevuto: ' + JSON.stringify(questionData));
      }

      setQuestion(questionData);
      setSelectedTopic(topic);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage('Errore: ' + msg);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const listModels = async () => {
    if (!apiKey) {
      setMessage('Inserisci la API key prima di verificare i modelli.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      if (!res.ok) {
        let err = 'Errore nel listModels';
        try { const j = await res.json(); err = j.error?.message || JSON.stringify(j); } catch (e) { err = await res.text(); }
        throw new Error(err);
      }

      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];
      setAvailableModels(models);
      if (models.length > 0) setSelectedModelResource(models[0]);
      setMessage(models.length ? `Trovati ${models.length} modelli.` : 'Nessun modello trovato per questa chiave.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage('Errore: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (index: number) => {
    if (answered) return;
    
    setAnswered(true);
    
    if (question && index === question.corretta) {
      setMessage('✅ Risposta corretta!');
      setScore(score + 1);
      
      if (level === 20) {
        setMessage('🎉 HAI VINTO! Hai completato tutti i 20 livelli!');
      } else {
        setTimeout(() => {
          setLevel(level + 1);
          setQuestion(null);
          setSelectedTopic(null);
          setAnswered(false);
          setMessage('');
        }, 2000);
      }
    } else {
      setMessage('❌ Risposta sbagliata! Torni al livello precedente.');
      
      setTimeout(() => {
        if (level > 1) {
          setLevel(level - 1);
        }
        setQuestion(null);
        setSelectedTopic(null);
        setAnswered(false);
        setMessage('');
      }, 2500);
    }
  };

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Quiz Challenge</h1>
            <p className="text-gray-600">20 livelli di difficoltà crescente!</p>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Inserisci la tua API Key di Google AI Studio
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">
              Ottieni la tua chiave su ai.google.dev
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={listModels}
                disabled={!apiKey}
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Verifica modelli
              </button>
              <select
                value={selectedModelResource}
                onChange={(e) => setSelectedModelResource(e.target.value)}
                className="ml-2 bg-white border border-gray-300 rounded-lg px-3"
              >
                <option value="models/gemini-1.5-flash">models/gemini-1.5-flash</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

          </div>

          <button
            onClick={() => setGameStarted(true)}
            disabled={!apiKey}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Inizia Gioco
          </button>
        </div>
      </div>
    );
  }

  if (level > 20) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <Trophy className="w-24 h-24 mx-auto mb-4 text-yellow-500" />
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Vittoria!</h1>
          <p className="text-xl text-gray-600 mb-4">Hai completato tutti i 20 livelli!</p>
          <p className="text-3xl font-bold text-purple-600 mb-6">Score: {score}/20</p>
          <button
            onClick={() => {
              setLevel(1);
              setScore(0);
              setQuestion(null);
              setSelectedTopic(null);
              setAnswered(false);
            }}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700"
          >
            Gioca Ancora
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Livello {level}/20</h2>
              <p className="text-gray-600">Difficoltà: {getDifficulty(level)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Score</p>
              <p className="text-3xl font-bold text-purple-600">{score}</p>
            </div>
          </div>
        </div>

        {/* Selezione Topic */}
        {!question && !loading && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
              Scegli un argomento
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {topics.map((topic) => {
                const Icon = topic.icon;
                return (
                  <button
                    key={topic.id}
                    onClick={() => generateQuestion(topic.id)}
                    className={`${topic.color} text-white p-6 rounded-xl hover:opacity-90 transition transform hover:scale-105 shadow-lg`}
                  >
                    <Icon className="w-12 h-12 mx-auto mb-3" />
                    <p className="font-semibold text-lg">{topic.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Generazione domanda...</p>
          </div>
        )}

        {/* Domanda */}
        {question && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="mb-6">
              <span className="inline-block bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-semibold mb-4">
                {topics.find(t => t.id === selectedTopic)?.name}
              </span>
              <h3 className="text-2xl font-bold text-gray-800">{question?.domanda}</h3>
            </div>

            <div className="space-y-3">
              {question?.risposte.map((risposta: string, index: number) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(index)}
                  disabled={answered}
                  className={`w-full text-left p-4 rounded-lg border-2 transition ${
                    answered && index === question!.corretta
                      ? 'bg-green-100 border-green-500'
                      : answered
                      ? 'bg-red-100 border-red-500 opacity-50'
                      : 'border-gray-300 hover:border-purple-500 hover:bg-purple-50'
                  } ${answered ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="font-semibold text-gray-700">
                    {String.fromCharCode(65 + index)}.
                  </span>{' '}
                  {risposta}
                </button>
              ))}
            </div>

            {message && (
              <div className={`mt-6 p-4 rounded-lg ${
                message.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                <p className="font-semibold text-center text-lg">{message}</p>
              </div>
            )}
          </div>
        )}

        {/* Errore */}
        {message && !question && !loading && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;