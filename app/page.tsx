"use client";
import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'realtime' | 'summarizer'>('realtime');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [sourceLang, setSourceLang] = useState('id');
  const [targetLang, setTargetLang] = useState('en');
  const [selectedMic, setSelectedMic] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('...');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState(''); // Initial summary is empty
  const [loadingSummary, setLoadingSummary] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // --- REF BARU untuk menyimpan transkrip saat ini ---
  const originalTextRef = useRef('');

  const languages = [
    { code: 'en', name: 'English' }, { code: 'id', name: 'Indonesian' },
    { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' }, { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' }, { code: 'zh', name: 'Chinese (Mandarin)' },
  ];

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const mics = devices.filter((d) => d.kind === 'audioinput');
        setMicDevices(mics);
        if (mics.length > 0) setSelectedMic(mics[0].deviceId);
      });
    }).catch(() => {
      alert('Microphone permission denied');
    });
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic } });
      streamRef.current = stream;
      const socket = new WebSocket(`wss://103.181.243.180/transcriber/ws/transcribe/${sourceLang}/${targetLang}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsRecording(true);
        setOriginalText('');
        setTranslatedText('');
        originalTextRef.current = ''; // Reset ref
        setSummary(''); // Clear previous summary
        setInterimText('Connected. Start speaking!');

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (socket.readyState === WebSocket.OPEN && e.data.size > 0) {
            socket.send(e.data);
          }
        };
        recorder.start(250);
      };

      socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'interim') {
          setInterimText(data.text);
        } else if (data.type === 'final') {
          setInterimText('...');
          // --- INI PERBAIKANNYA: Perbarui ref dan state bersamaan ---
          const newOriginal = data.original + ' ';
          originalTextRef.current += newOriginal; // Perbarui ref untuk summarizer
          setOriginalText((prev) => prev + newOriginal); // Perbarui state untuk tampilan
          setTranslatedText((prev) => prev + data.translated + ' ');
        }
      };

      socket.onclose = () => setInterimText('Disconnected.');
      socket.onerror = () => alert('WebSocket error occurred');
    } catch (err) {
      alert('Failed to access microphone');
    }
  };

  // --- FUNGSI BARU untuk merangkum dari teks ---
  const summarizeFromText = async (textToSummarize: string) => {
    if (!textToSummarize.trim()) {
        setSummary('No speech was detected to summarize.');
        return;
    }

    setActiveTab('summarizer'); // Beralih ke tab perangkum
    setLoadingSummary(true);
    setSummary('⏳ Generating summary from live session...');

    try {
      const res = await fetch(`https://103.181.243.180/transcriber/summarize-text/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            transcript: textToSummarize,
            target_lang: targetLang // Gunakan bahasa target yang dipilih
        }),
      });
      
      const json = await res.json();
      if (res.ok) {
        setSummary(json.summary || '✅ Summary received, but empty.');
      } else {
        setSummary(`❌ Error: ${json.detail || 'Failed to generate summary.'}`);
      }
    } catch (err) {
      setSummary('❌ Error: Failed to contact server for summarization.');
    } finally {
      setLoadingSummary(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    socketRef.current?.close();
    setIsRecording(false);
    setInterimText('Stopped. Summary will appear below.');

    // --- LOGIKA BARU: Panggil fungsi perangkum dengan teks dari ref ---
    summarizeFromText(originalTextRef.current);
  };

  const summarizeFile = async () => {
    if (!file) return alert('Select a file first');

    setLoadingSummary(true);
    setSummary('⏳ Summarizing file...');
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = file.type.startsWith('video/') ? '/summarize-video/' : '/summarize-audio/';

    try {
      // Tambahkan bahasa target sebagai query parameter
      const res = await fetch(`https://103.181.243.180/transcriber/${endpoint}?target_lang=${targetLang}`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (res.ok) {
        setSummary(json.summary || '✅ Summary received, but empty.');
      } else {
        setSummary(`❌ Error: ${json.detail || 'Failed to contact server.'}`);
      }
    } catch (err) {
      setSummary('❌ Error: Failed to contact server.');
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <main className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-blue-600 text-center mb-4">AI Transcriber & Summarizer</h1>

      <div className="flex border-b mb-4">
        <button onClick={() => setActiveTab('realtime')} className={`font-semibold px-4 py-2 ${activeTab === 'realtime' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Real-Time</button>
        <button onClick={() => setActiveTab('summarizer')} className={`font-semibold px-4 py-2 ${activeTab === 'summarizer' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Summarizer</button>
      </div> 

      {activeTab === 'realtime' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            <select value={selectedMic} onChange={(e) => setSelectedMic(e.target.value)} className="p-2 border rounded">
              {micDevices.map((device, i) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
            <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="p-2 border rounded">
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="p-2 border rounded">
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <button onClick={startRecording} disabled={isRecording} className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-blue-300">Start</button>
            <button onClick={stopRecording} disabled={!isRecording} className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-red-300">Stop</button>
          </div>
          <div className="border p-4 rounded bg-gray-100 min-h-[250px] flex flex-col">
            <div className="flex-grow overflow-y-auto">
                <p><strong>Original ({sourceLang.toUpperCase()}):</strong> {originalText}</p>
                <p className="mt-4"><strong>Translated ({targetLang.toUpperCase()}):</strong> {translatedText}</p>
            </div>
            <p className="text-gray-500 mt-4 pt-2 border-t">{interimText}</p>
          </div>
          
          {/* --- BAGIAN BARU UNTUK MENAMPILKAN RANGKUMAN --- */}
          {(loadingSummary || summary) && (
            <div className="border p-4 rounded bg-gray-50 mt-4">
                <h2 className="font-semibold mb-2 text-green-600">📌 Summary:</h2>
                {loadingSummary ? (
                    <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <p className="whitespace-pre-wrap">{summary}</p>
                )}
            </div>
          )}
        </div>
      )} 

      {activeTab === 'summarizer' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border p-2 rounded w-full"
            />
            <button onClick={summarizeFile} disabled={loadingSummary || !file} className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-blue-300">
              Summarize File
            </button>
          </div>

          <div className="border p-4 rounded bg-gray-100 whitespace-pre-wrap min-h-[300px]">
            {loadingSummary ? (
                <div className="flex justify-center items-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <p>{summary}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
