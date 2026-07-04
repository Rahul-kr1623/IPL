import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './CricketGame.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const emojis = ["✊", "☝️", "✌️", "🤟", "🖖", "✋", "🤙"];

export default function CricketGame() {
  const [screen, setScreen] = useState('lobby'); // lobby | waiting | toss | game | result
  
  // Lobby state
  const [myName, setMyName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [lobbyStatus, setLobbyStatus] = useState({ msg: '', error: false });
  const [waitingStatus, setWaitingStatus] = useState('Share this code with your friend');
  
  // Players
  const [oppName, setOppName] = useState('Opponent');
  
  // Toss state
  const [myTossMove, setMyTossMove] = useState(null);
  const [tossWaitingMsg, setTossWaitingMsg] = useState(false);
  const [tossResult, setTossResult] = useState(null); 
  const [tossWaitChoice, setTossWaitChoice] = useState(false);
  const [tossChoiceOptions, setTossChoiceOptions] = useState(false);
  
  // Game state
  const [isBatting, setIsBatting] = useState(false);
  const [inningsLabel, setInningsLabel] = useState('1st Innings');
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [target, setTarget] = useState(null);
  
  const [myMove, setMyMove] = useState(null);
  const [myMoveDisplay, setMyMoveDisplay] = useState('?');
  const [oppMoveDisplay, setOppMoveDisplay] = useState('?');
  const [myHandEmoji, setMyHandEmoji] = useState('✊');
  const [oppHandEmoji, setOppHandEmoji] = useState('✊');
  const [waitingMoveMsg, setWaitingMoveMsg] = useState(false);
  
  const [ballLog, setBallLog] = useState([]);
  const [roundResult, setRoundResult] = useState({ text: '', type: '' });
  const [isShaking, setIsShaking] = useState(false);
  
  // Result state
  const [matchResult, setMatchResult] = useState(null);
  const [rematchStatus, setRematchStatus] = useState('');
  
  const socketRef = useRef(null);
  const myNameRef = useRef(myName);
  const roomCodeRef = useRef(roomCode);

  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    socketRef.current = io(API_URL);
    const socket = socketRef.current;

    socket.on("roomCreated", ({ code }) => {
      setRoomCode(code);
      setWaitingStatus("Share this code with your friend");
      setScreen("waiting");
    });

    socket.on("roomError", ({ message }) => {
      setLobbyStatus({ msg: message, error: true });
    });

    socket.on("playerJoined", ({ names }) => {
      updateNames(names);
      setTimeout(() => {
        resetTossUI();
        setScreen("toss");
      }, 500);
    });

    socket.on("joinedRoom", ({ code, names }) => {
      setRoomCode(code);
      updateNames(names);
      setLobbyStatus({ msg: '', error: false });
      setTimeout(() => {
        resetTossUI();
        setScreen("toss");
      }, 300);
    });

    socket.on("tossResult", ({ you, opp, sum, winner, iWon }) => {
      setTossWaitingMsg(false);
      const even = sum % 2 === 0;
      setTossResult(`You: ${you}  •  Opponent: ${opp}  •  Sum: ${sum} (${even ? "Even" : "Odd"})  →  ${winner} wins the toss!`);
      
      if (iWon) {
        setTossChoiceOptions(true);
        setTossWaitChoice(false);
      } else {
        setTossChoiceOptions(false);
        setTossWaitChoice(true);
      }
    });

    socket.on("gameStart", ({ battingId, innings, names }) => {
      setIsBatting(battingId === socket.id);
      setMyScore(0);
      setOppScore(0);
      setTarget(null);
      setBallLog([]);
      setRoundResult({ text: '', type: '' });
      setInningsLabel(innings === 1 ? "1st Innings" : "2nd Innings");
      if (names) updateNames(names);
      
      setMyMove(null);
      setMyMoveDisplay('?');
      setOppMoveDisplay('?');
      setMyHandEmoji('✊');
      setOppHandEmoji('✊');
      setWaitingMoveMsg(false);
      
      setScreen("game");
    });

    socket.on("roundResult", ({ moves, batter, runs, isOut, scores, targetVal }) => {
      setMyMove(null);
      setWaitingMoveMsg(false);

      const myMoveVal = moves[socket.id] ?? 0;
      const oppKey = Object.keys(moves).find(k => k !== socket.id);
      const oppMoveVal = oppKey ? (moves[oppKey] ?? 0) : 0;

      setIsShaking(true);

      setTimeout(() => {
        setIsShaking(false);
        setMyHandEmoji(emojis[myMoveVal] ?? "✊");
        setOppHandEmoji(emojis[oppMoveVal] ?? "✊");
        setMyMoveDisplay(myMoveVal);
        setOppMoveDisplay(oppMoveVal);

        const newMyScore = scores[socket.id] || 0;
        const newOppScore = oppKey ? scores[oppKey] : 0;
        setMyScore(newMyScore);
        setOppScore(newOppScore);

        if (targetVal !== null && targetVal !== undefined) {
          setTarget(targetVal);
        }

        if (isOut) {
          setBallLog(prev => [...prev, 'W']);
          setRoundResult({
            type: 'out',
            text: batter === socket.id ? "❌ OUT! You're dismissed." : "✅ Wicket! Opponent is out."
          });
        } else {
          setBallLog(prev => [...prev, runs]);
          if (runs === 0) {
            setRoundResult({ type: 'dot', text: "• Dot ball" });
          } else {
            setRoundResult({
              type: 'scored',
              text: batter === socket.id ? `🔥 You scored ${runs}!` : `⚠️ Opponent scored ${runs}.`
            });
          }
        }
      }, 400);
    });

    socket.on("inningsEnd", ({ target }) => {
      setRoundResult({ type: 'dot', text: `Innings Over! Target is ${target}` });
    });

    socket.on("gameOver", ({ winnerId, scores, reason }) => {
      const isWinner = winnerId === socket.id;
      setMatchResult({
        title: isWinner ? "You Won!" : "You Lost!",
        subtitle: reason,
        myFinal: scores[socket.id] || 0,
        oppFinal: Object.entries(scores).find(([k]) => k !== socket.id)?.[1] || 0
      });
      setRematchStatus('');
      setScreen("result");
    });

    socket.on("waitingForRematch", () => {
      setRematchStatus("Waiting for opponent to accept...");
    });

    socket.on("rematchReady", () => {
      resetClientState();
      setScreen("toss");
    });

    socket.on("opponentLeft", () => {
      alert("Opponent left the match.");
      goLobbyInternal(socket);
    });

    return () => socket.disconnect();
  }, []);

  const updateNames = (names) => {
    const opp = names.find(n => n !== myNameRef.current) || "Opponent";
    setOppName(opp);
  };

  const resetTossUI = () => {
    setMyTossMove(null);
    setTossWaitingMsg(false);
    setTossResult(null);
    setTossChoiceOptions(false);
    setTossWaitChoice(false);
  };

  const resetClientState = () => {
    setMyMove(null);
    setMyTossMove(null);
    setMyScore(0);
    setOppScore(0);
    setTarget(null);
    setIsBatting(false);
    setBallLog([]);
  };

  // Lobby actions
  const createRoom = () => {
    if (!myName.trim()) return setLobbyStatus({ msg: "Please enter your name first.", error: true });
    setLobbyStatus({ msg: "Creating room...", error: false });
    socketRef.current.emit("createRoom", { name: myName.trim() });
  };

  const joinRoom = () => {
    if (!myName.trim()) return setLobbyStatus({ msg: "Please enter your name first.", error: true });
    if (!inputRoomCode.trim()) return setLobbyStatus({ msg: "Please enter a room code.", error: true });
    setRoomCode(inputRoomCode.trim().toUpperCase());
    setLobbyStatus({ msg: "Joining room...", error: false });
    socketRef.current.emit("joinRoom", { name: myName.trim(), roomCode: inputRoomCode.trim().toUpperCase() });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setWaitingStatus("Copied!");
      setTimeout(() => setWaitingStatus("Share this code with your friend"), 1500);
    });
  };

  // Toss actions
  const tossPick = (v) => {
    if (myTossMove !== null) return;
    setMyTossMove(v);
    setTossWaitingMsg(true);
    socketRef.current.emit("tossPick", { roomCode, move: v });
  };

  const tossChoice = (choice) => {
    setTossChoiceOptions(false);
    setTossWaitChoice(true);
    socketRef.current.emit("tossChoice", { roomCode, choice });
  };

  // Game actions
  const playRound = (userMove) => {
    if (myMove !== null) return;
    setMyMove(userMove);
    setWaitingMoveMsg(true);
    socketRef.current.emit("playerMove", { roomCode, move: userMove });
  };

  const goLobbyInternal = (socket) => {
    socket.emit("leaveRoom", { roomCode: roomCodeRef.current });
    resetClientState();
    setMyName('');
    setInputRoomCode('');
    setLobbyStatus({ msg: '', error: false });
    setScreen('lobby');
  };

  const goLobby = () => goLobbyInternal(socketRef.current);

  const playAgain = () => {
    socketRef.current.emit("requestRematch", { roomCode });
    setRematchStatus("Waiting for opponent...");
  };

  return (
    <div className="hand-cricket-wrapper">
      {screen === 'lobby' && (
        <div className="game-container">
          <h1>🏏 Hand Cricket</h1>
          <p className="subtitle">Real-time multiplayer</p>
          <div className="lobby-section">
            <input type="text" placeholder="Enter your name" maxLength="16" value={myName} onChange={e => setMyName(e.target.value)} />
          </div>
          <div className="lobby-section">
            <button className="btn btn-primary" onClick={createRoom}>Create Room</button>
            <div className="divider">— or join a room —</div>
            <input type="text" placeholder="Enter room code" maxLength="6" value={inputRoomCode} onChange={e => setInputRoomCode(e.target.value)} />
            <button className="btn btn-secondary" onClick={joinRoom}>Join Room</button>
          </div>
          {lobbyStatus.msg && <div className={`status-msg ${lobbyStatus.error ? 'error' : ''}`}>{lobbyStatus.msg}</div>}
        </div>
      )}

      {screen === 'waiting' && (
        <div className="game-container">
          <h1>🏏 Hand Cricket</h1>
          <p className="subtitle">Waiting for opponent...</p>
          <div className="room-display">
            Room Code
            <span className="room-code">{roomCode}</span>
          </div>
          <button className="btn btn-copy" onClick={copyCode}>📋 Copy Code</button>
          <div className="status-msg">{waitingStatus}</div>
        </div>
      )}

      {screen === 'toss' && (
        <div className="game-container">
          <h1>🏏 The Toss</h1>
          <p className="subtitle">Pick a number (0–6).<br/>Even sum = you win · Odd sum = opponent wins.</p>
          <div className="controls">
            {[0, 1, 2, 3, 4, 5, 6].map(num => (
              <button key={num} onClick={() => tossPick(num)} disabled={myTossMove !== null} className={myTossMove === num ? 'selected' : ''}>{num}</button>
            ))}
          </div>
          {tossWaitingMsg && <div className="status-msg">⏳ Waiting for opponent's pick...</div>}
          {tossResult && (
            <div>
              <p className="toss-result-text">{tossResult}</p>
              {tossChoiceOptions && (
                <div>
                  <p className="hint" style={{ marginBottom: '8px' }}>You won! Choose your role:</p>
                  <button className="btn btn-primary" onClick={() => tossChoice('bat')}>🏏 Bat First</button>
                  <button className="btn btn-secondary" onClick={() => tossChoice('bowl')}>⚾ Bowl First</button>
                </div>
              )}
              {tossWaitChoice && <p className="status-msg">Opponent is choosing...</p>}
            </div>
          )}
        </div>
      )}

      {screen === 'game' && (
        <div className="game-container">
          <div className="top-bar">
            <span className="innings-badge">{inningsLabel}</span>
            <span className={`status-inline ${!isBatting ? 'bowling' : ''}`}>
              {isBatting ? 'You are Batting 🏏' : 'You are Bowling ⚾'}
            </span>
          </div>

          <div className="scoreboard">
            <div className="score-box">
              <div className="score-label">{myName || 'You'}</div>
              <div className={`score-value ${!isBatting && target ? 'chasing' : ''}`}>{myScore}</div>
            </div>
            <div className="score-box target-box">
              <div className="score-label">Target</div>
              <div className="score-value">{target !== null ? target : '—'}</div>
            </div>
            <div className="score-box">
              <div className="score-label">{oppName}</div>
              <div className={`score-value ${isBatting && target ? 'chasing' : ''}`}>{oppScore}</div>
            </div>
          </div>

          {target !== null && (
            <div className="chase-bar-wrap">
              <div className="chase-bar-bg">
                <div className="chase-bar-fill" style={{ width: `${Math.min(100, Math.round((isBatting ? myScore : oppScore) / target * 100))}%` }}></div>
              </div>
              <span className="chase-bar-label">Need {Math.max(0, target - (isBatting ? myScore : oppScore))} more</span>
            </div>
          )}

          <div className="play-area">
            <div className="hand-box">
              <p>{oppName}</p>
              <div className={`hand ${isShaking ? 'shake' : ''}`}>{oppHandEmoji}</div>
              <div className="move-val">{oppMoveDisplay}</div>
            </div>
            <div className="vs-label">VS</div>
            <div className="hand-box">
              <p>{myName || 'You'}</p>
              <div className={`hand ${isShaking ? 'shake' : ''}`}>{myHandEmoji}</div>
              <div className="move-val">{myMoveDisplay}</div>
            </div>
          </div>

          {roundResult.text && (
            <div className={`round-result ${roundResult.type}`}>
              {roundResult.text}
            </div>
          )}

          <div className="ball-log-wrap">
            <div className="ball-log-title">This innings</div>
            <div className="ball-log">
              {ballLog.map((val, idx) => {
                let className = 'run';
                let display = val;
                if (val === 'W') className = 'w';
                else if (val === 6) className = 'six';
                else if (val === 4) className = 'four';
                else if (val === 0) className = 'dot';
                return <div key={idx} className={`ball ${className}`}>{display}</div>;
              })}
            </div>
          </div>

          <div className="controls">
            {[0, 1, 2, 3, 4, 5, 6].map(num => (
              <button key={num} onClick={() => playRound(num)} disabled={myMove !== null} className={myMove === num ? 'selected' : ''}>{num}</button>
            ))}
          </div>

          {waitingMoveMsg && <div className="status-msg">⏳ Waiting for opponent's move...</div>}
        </div>
      )}

      {screen === 'result' && matchResult && (
        <div className="game-container">
          <div className="result-icon">🏆</div>
          <h1>{matchResult.title}</h1>
          <p className="subtitle">{matchResult.subtitle}</p>
          <div className="final-scores">
            <div className="score-box">
              <div className="score-label">{myName || 'You'}</div>
              <div className="score-value">{matchResult.myFinal}</div>
            </div>
            <div className="score-box">
              <div className="score-label">{oppName}</div>
              <div className="score-value">{matchResult.oppFinal}</div>
            </div>
          </div>
          <div className="status-msg">{rematchStatus}</div>
          <button className="btn btn-primary" onClick={playAgain} disabled={!!rematchStatus}>Play Again</button>
          <button className="btn btn-secondary" onClick={goLobby}>Back to Lobby</button>
        </div>
      )}
    </div>
  );
}