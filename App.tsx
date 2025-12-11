import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { Send, Download, ShieldCheck, FileCheck, XCircle, Loader2, Wifi, Image as ImageIcon, FileText, Smartphone, Share2, Play, UploadCloud, RefreshCw, User, Github, Globe, Code, Heart, ArrowRight, Zap, Lock, Instagram } from 'lucide-react';
import { Footer } from './components/Footer';
import { Modal } from './components/Modal';
import { TransferState, FileMetadata, DataPacket, QueuedFile } from './types';

// Helper to generate a 6-digit ID
const generateId = () => Math.floor(100000 + Math.random() * 900000).toString();

// Function to format bytes to human readable string
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Optimized for Local Wi-Fi (LAN) Speed
const CHUNK_SIZE = 32 * 1024; // 32KB chunks for balance
const MAX_BUFFER_AMOUNT = 1024 * 1024; // 1MB Buffer - Allows faster bursts on LAN

const App: React.FC = () => {
  // --- View State ---
  const [view, setView] = useState<'home' | 'app'>('home');

  // --- App State ---
  const [myId, setMyId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [status, setStatus] = useState<TransferState>(TransferState.IDLE);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [isDragging, setIsDragging] = useState(false);
  
  // File State
  const [selectedFile, setSelectedFile] = useState<QueuedFile | null>(null);
  const [incomingMeta, setIncomingMeta] = useState<FileMetadata | null>(null);
  const [receivedFileUrl, setReceivedFileUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  // --- Refs for PeerJS and cleanup ---
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const incomingMetaRef = useRef<FileMetadata | null>(null);
  const receivedChunksRef = useRef<Blob[]>([]);
  const receivedSizeRef = useRef<number>(0);
  const heartbeatRef = useRef<number | null>(null);

  // --- Safety: Prevent accidental close ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === TransferState.TRANSFERRING || receivedFileUrl) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status, receivedFileUrl]);

  // Sync state to ref for callbacks
  useEffect(() => {
    incomingMetaRef.current = incomingMeta;
  }, [incomingMeta]);

  // --- Heartbeat Logic ---
  const startHeartbeat = (conn: DataConnection) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      if (conn.open) {
        conn.send({ type: 'heartbeat' });
      }
    }, 2000);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  // --- Initialization ---
  useEffect(() => {
    if (view === 'home') return; // Only init peer when entering app

    const initPeer = () => {
      const id = generateId();
      setMyId(id);
      
      const peer = new Peer(id, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
          ],
          sdpSemantics: 'unified-plan',
          iceCandidatePoolSize: 10, // Pre-fetch candidates for faster local connection
        }
      });

      peer.on('open', (id) => {
        setStatus(TransferState.IDLE);
        setStatusMessage('Online. Connect via Same Wi-Fi.');
      });

      peer.on('connection', (conn) => {
        handleIncomingConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
          initPeer();
        } else if (err.type === 'peer-unavailable') {
          setStatusMessage('Peer not found. Check ID.');
          setStatus(TransferState.FAILED);
        } else {
          setStatusMessage('Network issue. Retrying...');
          setTimeout(initPeer, 2000);
        }
      });

      peerRef.current = peer;
    };

    initPeer();

    return () => {
      stopHeartbeat();
      peerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // --- Connection Logic for RECEIVER ---
  const handleIncomingConnection = (conn: DataConnection) => {
    connRef.current = conn;
    setStatus(TransferState.CONNECTED);
    setStatusMessage(`Connected to sender`);
    setActiveTab('receive');
    startHeartbeat(conn);

    // Reset chunks
    receivedChunksRef.current = [];
    receivedSizeRef.current = 0;

    conn.on('data', (data: any) => {
      const packet = data as DataPacket;

      if (packet.type === 'file-meta') {
        setIncomingMeta(packet.payload);
        setStatus(TransferState.WAITING_APPROVAL);
      } 
      else if (packet.type === 'file-start') {
        setStatus(TransferState.TRANSFERRING);
        setStatusMessage('Receiving file...');
        receivedChunksRef.current = [];
        receivedSizeRef.current = 0;
        setProgress(0);
      }
      else if (packet.type === 'file-chunk') {
        // Handle chunk
        const chunk = packet.payload; // ArrayBuffer
        receivedChunksRef.current.push(new Blob([chunk]));
        receivedSizeRef.current += chunk.byteLength;
        
        if (incomingMetaRef.current) {
           const percent = Math.round((receivedSizeRef.current / incomingMetaRef.current.size) * 100);
           setProgress(percent);
        }
      }
      else if (packet.type === 'file-end') {
        // Reassemble
        if (incomingMetaRef.current) {
            const blob = new Blob(receivedChunksRef.current, { type: incomingMetaRef.current.type });
            const url = URL.createObjectURL(blob);
            setReceivedFileUrl(url);
            setStatus(TransferState.COMPLETED);
            setStatusMessage('File received successfully!');
            setProgress(100);
        }
      }
      else if (packet.type === 'reject') {
        setStatus(TransferState.IDLE);
        setStatusMessage('Transfer cancelled.');
        setIncomingMeta(null);
      }
    });

    conn.on('close', () => {
      stopHeartbeat();
      setStatus(TransferState.IDLE);
      setStatusMessage('Sender disconnected.');
      connRef.current = null;
    });

    conn.on('error', () => {
        setStatus(TransferState.FAILED);
        setStatusMessage('Connection error occurred.');
    });
  };

  // --- Connection Logic for SENDER ---
  const connectToPeer = () => {
    if (!targetId || !peerRef.current) return;
    
    setStatus(TransferState.CONNECTING);
    setStatusMessage('Connecting...');

    const conn = peerRef.current.connect(targetId, { 
        reliable: true,
        serialization: 'binary'
    });
    
    conn.on('open', () => {
      connRef.current = conn;
      setStatus(TransferState.CONNECTED);
      setStatusMessage('Connected! Select a file.');
      startHeartbeat(conn);
    });

    conn.on('data', (data: any) => {
      const packet = data as DataPacket;
      if (packet.type === 'approve') {
        startChunkedUpload();
      } else if (packet.type === 'reject') {
        setStatus(TransferState.FAILED);
        setStatusMessage('Receiver rejected.');
        setTimeout(() => setStatus(TransferState.CONNECTED), 2000);
      }
    });

    conn.on('error', (err) => {
      setStatus(TransferState.FAILED);
      setStatusMessage('Connection failed. Check ID.');
    });
    
    conn.on('close', () => {
        stopHeartbeat();
        if (status !== TransferState.COMPLETED) {
             setStatus(TransferState.IDLE);
             setStatusMessage('Connection closed.');
        }
    });

    setTimeout(() => {
        if(connRef.current?.open === false) {
             setStatus(TransferState.FAILED);
             setStatusMessage('Connection timed out. Check ID.');
        }
    }, 10000);
  };

  // --- File Selection & Drag Drop ---
  const processFile = (file: File) => {
      let previewUrl: string | undefined = undefined;
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        previewUrl = URL.createObjectURL(file);
      }
      setSelectedFile({ file, previewUrl });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // --- Transfer Logic ---
  const requestSend = () => {
    if (!connRef.current || !selectedFile) return;
    
    const meta: FileMetadata = {
      name: selectedFile.file.name,
      size: selectedFile.file.size,
      type: selectedFile.file.type
    };

    connRef.current.send({
      type: 'file-meta',
      payload: meta
    });

    setStatus(TransferState.WAITING_APPROVAL);
    setStatusMessage('Waiting for acceptance...');
  };

  const startChunkedUpload = async () => {
    if (!connRef.current || !selectedFile) return;

    setStatus(TransferState.TRANSFERRING);
    setStatusMessage('Starting transfer...');
    
    // 1. Send signal start
    connRef.current.send({ type: 'file-start' });

    // 2. Loop and send chunks with Optimized Backpressure for LAN
    // Brief pause to ensure Receiver is ready to receive data
    await new Promise(r => setTimeout(r, 200));

    setStatusMessage('Sending file...');

    const file = selectedFile.file;
    let offset = 0;

    while(offset < file.size) {
        // Connection Check
        if (!connRef.current.open) {
            setStatus(TransferState.FAILED);
            setStatusMessage('Connection lost during transfer');
            return;
        }

        // Backpressure Control
        const dc = (connRef.current as any).dataChannel;
        if (dc && dc.bufferedAmount > MAX_BUFFER_AMOUNT) {
            // Wait for buffer to drain significantly
            await new Promise(r => setTimeout(r, 50));
            continue; 
        }

        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();

        connRef.current.send({
            type: 'file-chunk',
            payload: buffer
        });

        offset += CHUNK_SIZE;
        const percent = Math.min(100, Math.round((offset / file.size) * 100));
        setProgress(percent);
    }

    // 3. Send end signal
    connRef.current.send({ type: 'file-end' });
    setStatus(TransferState.COMPLETED);
    setStatusMessage('Sent Successfully!');
  };

  const acceptTransfer = () => {
    if (!connRef.current) return;
    if (!connRef.current.open) {
        alert("Connection lost. Please refresh and try again.");
        return;
    }
    
    connRef.current.send({ type: 'approve' });
    setStatus(TransferState.TRANSFERRING);
    setStatusMessage('Connecting to transfer...');
  };

  const rejectTransfer = () => {
    if (!connRef.current) return;
    connRef.current.send({ type: 'reject' });
    setIncomingMeta(null);
    setStatus(TransferState.IDLE);
    setStatusMessage('Request declined.');
  };

  const reset = () => {
    if (window.confirm("Start new transfer? Unsaved files will be lost.")) {
      setStatus(TransferState.IDLE);
      setIncomingMeta(null);
      setReceivedFileUrl(null);
      setSelectedFile(null);
      setProgress(0);
      setStatusMessage('Online. Connect via Same Wi-Fi.');
    }
  };

  const copyLink = () => {
      navigator.clipboard.writeText("https://ptop-share.vercel.app/");
      alert("Link copied!");
  }

  // --- Render Helpers ---
  const renderStatusIcon = () => {
    switch (status) {
      case TransferState.CONNECTING:
      case TransferState.TRANSFERRING:
      case TransferState.WAITING_APPROVAL:
        return <Loader2 className="animate-spin text-blue-400" size={32} />;
      case TransferState.COMPLETED:
        return <FileCheck className="text-green-500" size={32} />;
      case TransferState.FAILED:
        return <XCircle className="text-red-500" size={32} />;
      default:
        return <Wifi className="text-gray-500" size={32} />;
    }
  };

  // --- Views ---

  const renderHome = () => (
    <div className="flex-1 max-w-4xl mx-auto w-full p-4 flex flex-col gap-12 animate-fade-in pb-20">
      
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-10">
        <div className="flex justify-center mb-6">
           <div className="bg-gray-800 p-4 rounded-3xl border border-gray-700 shadow-2xl shadow-blue-900/20">
             <ShieldCheck size={64} className="text-green-400" />
           </div>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-green-400 via-blue-500 to-purple-500 bg-clip-text text-transparent pb-2">
          PrivateShare P2P
        </h1>
        <p className="text-xl text-gray-400 max-w-xl mx-auto">
          Instant, limitless file sharing over Local Wi-Fi. 
          <br/>
          <span className="text-blue-400 font-semibold">Original Quality. No Cloud. Secure.</span>
        </p>
        
        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 max-w-lg mx-auto text-left space-y-4">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Wifi size={20} className="text-yellow-500"/>
                How to Connect Instantly
            </h3>
            <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                    <span className="bg-gray-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mt-0.5">1</span>
                    Connect both devices to the <b>Same Wi-Fi</b> or use a <b>Mobile Hotspot</b>.
                </li>
                <li className="flex items-start gap-2">
                    <span className="bg-gray-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mt-0.5">2</span>
                    Open this app on both devices.
                </li>
                <li className="flex items-start gap-2">
                    <span className="bg-gray-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mt-0.5">3</span>
                    Enter the ID and tap Send. The transfer will be direct and super fast.
                </li>
            </ul>
        </div>

        <button 
          onClick={() => setView('app')}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-10 rounded-full shadow-lg shadow-blue-900/30 active:scale-95 transition-all text-lg flex items-center gap-3 mx-auto"
        >
          Start Sharing <ArrowRight size={20} />
        </button>
      </section>

      {/* Developer About Section */}
      <section className="border-t border-gray-800 pt-12 mt-12">
        <div className="bg-gray-900/40 rounded-3xl border border-gray-800 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-blue-500"></div>
            
            <div className="p-8 flex flex-col md:flex-row gap-8 items-start">
                 <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                    <User size={40} className="text-white" />
                 </div>

                 <div className="space-y-4 flex-1">
                     <div>
                         <h2 className="text-2xl font-bold text-white mb-1">Hey, I'm Rishabh Kumar.</h2>
                         <p className="text-sm text-blue-400 font-medium">Full Stack Developer 🇮🇳</p>
                     </div>
                     
                     <p className="text-gray-300 leading-relaxed max-w-2xl">
                        I'm a software engineer who loves building tools that are actually useful. 
                        I created <span className="text-white font-semibold">PrivateShare</span> because I believe your files should stay yours—no clouds, no compression, and no middleman.
                        Just you and your friends, sharing directly. Technology is my life, and I'm always building something new.
                     </p>

                     <div className="flex gap-4 pt-2">
                        <a href="https://rishabhsahil.vercel.app/" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white text-sm transition-colors border border-gray-700">
                            <Globe size={16} /> Portfolio
                        </a>
                        <a href="https://instagram.com/rishabhsahill" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-pink-600 to-orange-500 hover:opacity-90 rounded-lg text-white text-sm transition-opacity shadow-lg">
                            <Zap size={16} /> Instagram
                        </a>
                     </div>
                 </div>
            </div>
        </div>
      </section>
    </div>
  );

  const renderApp = () => (
    <div className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col justify-center animate-fade-in">
        {/* Status Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 shadow-xl text-center relative overflow-hidden">
            <div className="flex justify-center mb-4 relative z-10">
                {renderStatusIcon()}
            </div>
            <h2 className="text-lg font-medium text-gray-200 relative z-10">{statusMessage}</h2>
            
            {status === TransferState.TRANSFERRING && (
                <div className="w-full bg-gray-800 rounded-full h-2.5 mt-4 overflow-hidden relative z-10">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
            )}
            
            {status === TransferState.TRANSFERRING && statusMessage.includes('Connecting to transfer') && (
                <div className="mt-4 relative z-10">
                    <button 
                        onClick={acceptTransfer}
                        className="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-full flex items-center gap-2 mx-auto transition-colors"
                    >
                        <RefreshCw size={14} /> Retry Connection
                    </button>
                </div>
            )}
        </div>

        {/* Action Tabs */}
        <div className="flex bg-gray-900 p-1 rounded-xl mb-6 border border-gray-800">
            <button 
                onClick={() => setActiveTab('send')}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'send' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
                SEND
            </button>
            <button 
                onClick={() => setActiveTab('receive')}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'receive' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
                RECEIVE
            </button>
        </div>

        {/* Sender View */}
        {activeTab === 'send' && (
            <div className="space-y-4 animate-fade-in">
                {(status === TransferState.IDLE || status === TransferState.FAILED) && (
                    <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                        <label className="block text-gray-400 text-sm mb-2">Receiver's 6-Digit ID</label>
                        <div className="flex gap-2 w-full">
                            <input 
                                type="number" 
                                placeholder="000000"
                                value={targetId}
                                onChange={(e) => setTargetId(e.target.value.slice(0, 6))}
                                className="flex-1 min-w-0 bg-gray-950 border border-gray-700 text-white text-center text-xl sm:text-2xl tracking-widest rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <button 
                                onClick={connectToPeer}
                                disabled={targetId.length !== 6}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 sm:px-6 rounded-xl transition-all"
                            >
                                <Wifi size={24} />
                            </button>
                        </div>
                    </div>
                )}

                {(status === TransferState.CONNECTED || status === TransferState.COMPLETED || status === TransferState.WAITING_APPROVAL) && (
                    <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700"
                         onDragOver={handleDragOver}
                         onDragLeave={handleDragLeave}
                         onDrop={handleDrop}
                    >
                        {!selectedFile ? (
                            <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all group ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:bg-gray-800/80 hover:border-blue-500'}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <UploadCloud className={`w-10 h-10 mb-3 ${isDragging ? 'text-blue-400' : 'text-gray-400 group-hover:text-blue-500'}`} />
                                    <p className="mb-2 text-sm text-gray-400 text-center"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-gray-500">Original Resolution Preserved</p>
                                </div>
                                <input type="file" className="hidden" onChange={handleFileSelect} />
                            </label>
                        ) : (
                            <div className="space-y-4">
                                <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-700 group">
                                    {selectedFile.previewUrl ? (
                                        selectedFile.file.type.startsWith('video') ? (
                                            <video src={selectedFile.previewUrl} className="w-full h-48 object-contain bg-black" controls={false} />
                                        ) : (
                                            <img src={selectedFile.previewUrl} alt="Preview" className="w-full h-48 object-contain bg-black" />
                                        )
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48">
                                            {selectedFile.file.name.endsWith('.apk') ? <Smartphone size={48} className="text-green-500 mb-2"/> : <FileText size={48} className="text-blue-500 mb-2"/>}
                                            <span className="text-gray-400 text-sm">{selectedFile.file.name.split('.').pop()?.toUpperCase()} File</span>
                                        </div>
                                    )}
                                    <button 
                                        onClick={() => setSelectedFile(null)}
                                        className="absolute top-2 right-2 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full transition-colors"
                                    >
                                        <XCircle size={20} />
                                    </button>
                                </div>
                                
                                <div className="flex justify-between text-sm text-gray-400 px-1">
                                    <span className="truncate max-w-[200px]">{selectedFile.file.name}</span>
                                    <span>{formatBytes(selectedFile.file.size)}</span>
                                </div>

                                {status === TransferState.WAITING_APPROVAL ? (
                                    <div className="space-y-2">
                                        <p className="text-center text-sm text-yellow-500 animate-pulse">Waiting for receiver to accept...</p>
                                        <button 
                                            onClick={startChunkedUpload}
                                            className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Play size={16} />
                                            FORCE START (If stuck)
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={requestSend}
                                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Send size={20} />
                                        SEND ORIGINAL
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* Receiver View */}
        {activeTab === 'receive' && (
             <div className="space-y-4 animate-fade-in">
                 {status === TransferState.IDLE && (
                     <div className="bg-gray-800/50 p-8 rounded-2xl border border-gray-700 text-center flex flex-col items-center">
                         <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-4 border border-gray-700 shadow-inner">
                             <Wifi className="text-green-500 animate-pulse" size={32} />
                         </div>
                         <h3 className="text-xl font-bold text-white mb-2">Ready to Receive</h3>
                         <p className="text-gray-400 text-sm">Tell the sender to enter your ID:</p>
                         <p className="text-3xl font-mono text-green-400 font-bold mt-4 tracking-widest select-all bg-gray-900 px-4 py-2 rounded-lg border border-gray-800">{myId}</p>
                     </div>
                 )}

                 {/* Incoming Request Modal */}
                 <Modal isOpen={!!incomingMeta && status === TransferState.WAITING_APPROVAL} title="Incoming File Request">
                    <div className="flex flex-col items-center text-center">
                        {incomingMeta?.type.startsWith('image') ? <ImageIcon size={48} className="text-purple-500 mb-4" /> : <FileText size={48} className="text-blue-500 mb-4" />}
                        <p className="text-lg font-bold text-white mb-1 break-all">{incomingMeta?.name}</p>
                        <p className="text-sm text-gray-400 mb-6">{incomingMeta ? formatBytes(incomingMeta.size) : '0 B'} • Original Quality</p>
                        
                        <div className="flex gap-4 w-full">
                            <button 
                                onClick={rejectTransfer}
                                className="flex-1 py-3 bg-gray-700 hover:bg-red-600 text-white rounded-xl transition-colors font-semibold"
                            >
                                Decline
                            </button>
                            <button 
                                onClick={acceptTransfer}
                                className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-colors font-bold shadow-lg shadow-green-900/20 active:scale-95"
                            >
                                Accept
                            </button>
                        </div>
                    </div>
                 </Modal>

                 {/* Download Link */}
                 {status === TransferState.COMPLETED && receivedFileUrl && (
                     <div className="bg-green-900/20 border border-green-500/30 p-6 rounded-2xl text-center">
                         <FileCheck className="text-green-500 mx-auto mb-3" size={48} />
                         <h3 className="text-xl font-bold text-white mb-4">Transfer Complete</h3>
                         <div className="flex flex-col gap-3">
                            <a 
                                href={receivedFileUrl} 
                                download={incomingMeta?.name || 'downloaded_file'}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Download size={20} />
                                SAVE TO DEVICE
                            </a>
                            
                            {/* If image/video, show preview */}
                            {incomingMeta?.type.startsWith('image/') && (
                                <img src={receivedFileUrl} alt="Received" className="rounded-lg mt-2 max-h-60 object-contain mx-auto border border-gray-700" />
                            )}
                            {incomingMeta?.type.startsWith('video/') && (
                                <video src={receivedFileUrl} controls className="rounded-lg mt-2 max-h-60 mx-auto border border-gray-700" />
                            )}
                            <p className="text-xs text-gray-500 mt-2">Data cleared from memory after download.</p>
                         </div>
                     </div>
                 )}
             </div>
        )}

        {(status === TransferState.COMPLETED || status === TransferState.FAILED) && (
            <button 
                onClick={reset}
                className="mt-6 text-gray-500 hover:text-white text-sm underline underline-offset-4"
            >
                Start New Transfer
            </button>
        )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col font-sans selection:bg-pink-500 selection:text-white">
      {/* Header */}
      <header className="p-4 bg-gray-900/50 backdrop-blur-md border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <ShieldCheck className="text-green-400" size={28} />
            <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent hidden sm:block">
              PrivateShare
            </h1>
          </div>
          <div className="flex gap-2 items-center">
              {view === 'app' && (
                  <div className="bg-gray-800 px-3 py-1 rounded-full border border-gray-700 flex items-center">
                    <span className="text-xs text-gray-400 uppercase mr-2 hidden sm:inline">ID:</span>
                    <span className="font-mono font-bold text-green-400 text-lg tracking-widest">
                      {myId || <span className="animate-pulse">...</span>}
                    </span>
                  </div>
              )}
              <button onClick={copyLink} className="p-2 bg-gray-800 rounded-full border border-gray-700 hover:text-blue-400 active:scale-95 transition-transform">
                  <Share2 size={18} />
              </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {view === 'home' ? renderHome() : renderApp()}

      <Footer />
    </div>
  );
};

export default App;
