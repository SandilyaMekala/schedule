import React, { useState, useRef, useEffect } from 'react';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'; // Required for ShadowGenerator
import AWS from 'aws-sdk';
import { HostObject, LipsyncFeature, aws as AwsFeatures } from '@amazon-sumerian-hosts/babylon';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4, Vector3, Angle } from '@babylonjs/core/Maths/math';
import { cognitoIdentityPoolId } from './demo-credentials';
import { ShadowGenerator } from '@babylonjs/core';
import './sumerian.css';

AWS.config.region = cognitoIdentityPoolId.split(':')[0];
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: cognitoIdentityPoolId,
});

let canvas;
let host;

const SumerianHost = () => {
  const [scene, setScene] = useState(null);
  const [lex, setLex] = useState(null);
  const [isMicEnabled, setMicEnabled] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  function setupSceneEnvironment(scene) {
    // Create a simple environment.
    const environmentHelper = scene.createDefaultEnvironment({
      groundOpacity: 1,
      groundShadowLevel: 0.1,
    });
    environmentHelper.setMainColor(Color3.Teal());
  
    scene.environmentIntensity = 1.2;
  
    const shadowLight = new DirectionalLight(
      'shadowLight',
      new Vector3(0.8, -2, -1)
    );
    shadowLight.diffuse = new Color3(1, 0.9, 0.62);
    shadowLight.intensity = 2;
  
    const keyLight = new DirectionalLight('keyLight', new Vector3(0.3, -1, -2));
    keyLight.diffuse = new Color3(1, 0.9, 0.65);
    keyLight.intensity = 3;
  
    // Add a camera.
    const cameraRotation = Angle.FromDegrees(85).radians();
    const cameraPitch = Angle.FromDegrees(70).radians();
    const camera = new ArcRotateCamera(
      'camera',
      cameraRotation,
      cameraPitch,
      2.6,
      new Vector3(0, 1.0, 0)
    );
    camera.wheelDeltaPercentage = 0.01;
    camera.minZ = 0.01;
  
    // Initialize user control of camera.
    canvas = scene.getEngine().getRenderingCanvas();
    camera.detachControl(canvas, true);
  
    const shadowGenerator = new ShadowGenerator(2048, shadowLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 8;
    scene.meshes.forEach(mesh => {
      shadowGenerator.addShadowCaster(mesh);
    });
  
    return {scene, shadowGenerator};
  }

  useEffect(() => {
    const createScene = async (canvas) => {
      const newScene = new Scene();
      newScene.useRightHandedSystem = true;

      const { shadowGenerator } = setupSceneEnvironment(newScene);

      const characterId = "Grace";
      const pollyConfig = { pollyVoice: "Joanna", pollyEngine: "neural", LipsyncFeature: true };
      const characterConfig = HostObject.getCharacterConfig(
        "./assets/character-assets",
        characterId
      );
      host = await HostObject.createHost(newScene, characterConfig, pollyConfig);

      host.PointOfInterestFeature.setTarget(newScene.activeCamera);

      newScene.meshes.forEach((mesh) => {
        shadowGenerator.addShadowCaster(mesh);
      });

      const lexClient = new AWS.LexRuntime();
      const botConfig = {
        botName: "BookTrip",
        botAlias: "Dev",
      };
      const newLex = new AwsFeatures.LexFeature(lexClient, botConfig);
      setLex(newLex);

      return newScene;
    };

    const canvas = document.getElementById("renderCanvas");
    const engine = new Engine(canvas, true);

    createScene(canvas).then((newScene) => {
      setScene(newScene);
      engine.runRenderLoop(() => newScene.render());
    });

    window.addEventListener("resize", () => engine.resize());

    return () => {
      window.removeEventListener("resize", () => engine.resize());
    };
  }, []);

  const startMainExperience = () => {
    host.LipsyncFeature.enable();
    host.TextToSpeechFeature.play(`Hi, I'm healthcare chatbot. How can I help you today?`);
    document.getElementById("helloWorldContainer").style.display = "block";
    document.getElementById("logo").style.display = "block";
  };

  const handleMicAccess = async () => {
    try {
      await lex.enableMicInput();
      setMicEnabled(true);
    } catch (e) {
      if (e.message === "Permission dismissed") {
        alert("Microphone permission dismissed");
      } else {
        alert("Microphone access disabled.");
      }
    }
  };

  const handleVoiceInput = () => {
    lex.beginVoiceRecording();
  };

  const handleVoiceRelease = () => {
    lex.endVoiceRecording();
  };

  const handleLexResponse = async (response) => {
    setIsProcessing(false);
    setTranscript(response.inputTranscript);

    const modifiedTranscript = response.inputTranscript;
    const url = "https://29s6jt8p7h.execute-api.us-east-1.amazonaws.com/Dev/lex";

    try {
      const fetchResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          botName: "BookTrip",
          botAlias: "Dev",
          userId: "testuser",
          inputText: modifiedTranscript,
        }),
      });

      if (!fetchResponse.ok) throw new Error("Network error");

      const data = await fetchResponse.json();
      if (data.PHI_validation) {
        const keywords = data.PHI_entities.map((entity) => entity.Type).join(", ");
        const finalMessage = `Oh no! private information, cannot disclose. Avoid using keywords such as, ${keywords}`;
        host.TextToSpeechFeature.play(finalMessage);
      } else {
        host.TextToSpeechFeature.play(data.response);
      }
    } catch (error) {
      console.error(error);
      host.TextToSpeechFeature.play("Sorry, I could not retrieve a response.");
    }
  };

  const handleTextSubmit = () => {
    const speech = document.getElementById("Text").value;
    if (speech.trim()) {
      handleLexResponse({ inputTranscript: speech });
    } else {
      alert("No text entered.");
    }
  };

  return (
    <div id="mainScreen" className="screen loading">
      <canvas id="renderCanvas"/>
      <div id="uiScreens">
        <img id="logo" src="assets/Logo.png" alt="Logo" style={{ display: "none", position: "absolute", top: "20px", right: "20px", width: "200px" }} />
        <div id="startScreen" className="screen modal hide">
          <div id="startDialog" className="dialog">
            <h2>Welcome to the Chatbot Demo</h2>
            <button onClick={startMainExperience}>Start</button>
          </div>
        </div>
        <div id="micInitScreen" className="screen modal hide"></div>
        <div id="micDisabledScreen" className="screen modal hide">
          <div className="dialog">
            <p>
              The browser has disabled microphone access for this website.
              Please update your browser preferences to allow microphone access.
              Then, reload this page.
            </p>
          </div>
        </div>
        <div id="chatbotUiScreen" className="screen hide">
          <div id="uiPanel" className="panel">
            <p className="instructions">Press and hold the button below to speak to the host.</p>
            <button id="talkButton" onMouseDown={handleVoiceInput} onMouseUp={handleVoiceRelease}>
              Push To Talk
            </button>
            <button id="stopSpeechButton" onClick={() => host.TextToSpeechFeature.stop()}>
              Stop Speaking
            </button>
          </div>
          <div id="userMessageContainer" className="noChildPointerEvents">
            <div className="messageBox">
              <div id="transcriptDisplay" className="message">
                <div className="label">The chatbot thinks you said...</div>
                <p id="transcriptText">{transcript || "I'd like to rent a car"}</p>
              </div>
              {isProcessing && (
                <div id="processingMessage" className="message">
                  <p>
                    <span className="spinner"></span>processing...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div id="helloWorldContainer">
          <textarea id="Text" rows="4" placeholder="Enter text here..." />
          <button id="TextButton" onClick={handleTextSubmit}>Text</button>
        </div>
      </div>
    </div>
  );
};

export default SumerianHost;
