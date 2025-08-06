"use client";
import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'realtime' | 'summarizer'>('summarizer');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [sourceLang, setSourceLang] = useState('id');
  const [targetLang, setTargetLang] = useState('en');
  const [selectedMic, setSelectedMic] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('...');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState('Summary will appear here...');
  const [loadingSummary, setLoadingSummary] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'id', name: 'Indonesian' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese (Mandarin)' },
  ];

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const mics = devices.filter((d) => d.kind === 'audioinput');
        setMicDevices(mics);
        if (mics[0]) setSelectedMic(mics[0].deviceId);
      });
    }).catch(() => {
      alert('Microphone permission denied');
    });
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic } });
      streamRef.current = stream;
      const socket = new WebSocket(`ws://localhost:8000/ws/transcribe/${sourceLang}/${targetLang}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsRecording(true);
        setOriginalText('');
        setTranslatedText('');
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
          setOriginalText((prev) => prev + data.original + ' ');
          setTranslatedText((prev) => prev + data.translated + ' ');
        }
      };

      socket.onclose = () => setInterimText('Disconnected.');
      socket.onerror = () => alert('WebSocket error occurred');
    } catch (err) {
      alert('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    socketRef.current?.close();
    setIsRecording(false);
    setInterimText('Stopped.');
  };

  const summarizeFile = async () => {
    if (!file) return alert('Select a file first');

    setLoadingSummary(true);
    setSummary('⏳ Summarizing...');
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = file.type.startsWith('video/') ? '/summarize-video/' : '/summarize-audio/';

    try {
      const res = await fetch(`https://103.181.243.180/transcriber/${endpoint}`, {
      // const res = await fetch(`http://localhost:8000${endpoint}`, {

        method: 'POST',
        body: formData,
      });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        setTranscript(json.transcript || 'No transcript available.');
        setSummary(json.summary || '✅ Summary received, but empty.');

      } catch {
        setSummary(text);
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

      {/* <div className="flex gap-4 mb-4">
        <button onClick={() => setActiveTab('realtime')} className={`font-semibold px-4 py-2 ${activeTab === 'realtime' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Real-Time</button>
        <button onClick={() => setActiveTab('summarizer')} className={`font-semibold px-4 py-2 ${activeTab === 'summarizer' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Summarizer</button>
      </div> */}

      {/* {activeTab === 'realtime' && (
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
          <div className="border p-4 rounded bg-gray-100 min-h-[150px]">
            <p className="text-gray-500 mb-2">{interimText}</p>
            <p><strong>Original:</strong> {originalText}</p>
            <p><strong>Translated:</strong> {translatedText}</p>
          </div>
        </div>
      )} */}

      {activeTab === 'summarizer' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border p-2"
            />
            <button onClick={summarizeFile} className="bg-blue-600 text-white px-4 py-2 rounded">
              Summarize
            </button>
          </div>

          {loadingSummary && <div className="loader self-center" />}

          <div className="border p-4 rounded bg-gray-100 whitespace-pre-wrap">
            <h2 className="font-semibold mb-2 text-blue-600">📝 Transcript:</h2>
            <p className="mb-4">{transcript}</p>

            <h2 className="font-semibold mb-2 text-green-600">📌 Summary:</h2>
            <p>{summary}</p>
          </div>
        </div>

      )}
    </main>
  );
}