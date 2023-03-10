import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import { useState, useRef } from "react";
import "./App.css";
import Button from "./components/Button";
import PresenceIndicator from "./components/PresenceIndicator";

let socket;
let device;
let producerTransport;
let producer;
let consumer;
let consumerTransport;
let rtpCapabilities;

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let params = {
  // mediasoup params
  encodings: [],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
};

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);

  async function connectRecvTransport() {
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume");
          return;
        }

        console.log(params);
        // then consume with the local consumer transport
        // which creates a consumer
        consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        // destructure and retrieve the video track from the producer
        const { track } = consumer;

        audioRef.current.srcObject = new MediaStream([track])

        // the server consumer started with media paused
        // so we need to inform the server to resume
        socket.emit("consumerResume");
      }
    );
  }

  async function createRecvTransport() {
    if(!device) {
      await createDevice(rtpCapabilities);
    }
    
    await socket.emit(
      "request:webRtcTransport",
      { sender: false },
      ({ params }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }

        consumerTransport = device.createRecvTransport(params);

        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              console.log("hey");
              await socket.emit("transportRecvConnect", {
                dtlsParameters,
              });
              callback();
            } catch (error) {
              errback(error);
            }
          }
        );

        connectRecvTransport();
      }
    );
  }

  async function connectSendTransport() {
    producer = await producerTransport.produce(params);

    producer.on("trackended", () => {
      console.log("track ended");
      // close audio track
    });

    producer.on("transportclose", () => {
      console.log("transport ended");
      // close audio track
    });
  }

  async function createSendTransport() {
    socket.emit("request:webRtcTransport", { sender: true }, (response) => {
      if (response.params.error) {
        console.log(response.params.error);
        return;
      }

      producerTransport = device.createSendTransport(response.params);

      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await socket.emit("transportConnect", {
              dtlsParameters,
            });

            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransport.on("produce", async (parameters, callback, errback) => {
        console.log(parameters);

        try {
          await socket.emit(
            "transportProduce",
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            },
            ({ id }) => {
              callback({ id });
            }
          );
        } catch (error) {
          errback(error);
        }
      });
      connectSendTransport();
    });
  }

  async function createDevice(routerRtpCapabilities) {
    try {
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities }); 
    } catch (error) {
      if (error.name === "UnsupportedError") {
        console.error("browser not supported");
      }
    }
  }

  const handleGetAudio = async () => {
    navigator.mediaDevices
      .getUserMedia({ video: false, audio: true })
      .then(async (stream) => {
        console.log("success stream request");
        const track = stream.getAudioTracks()[0];
        params = {
          track,
          ...params,
        };
        await createDevice(rtpCapabilities);
        await createSendTransport();
      })
      .catch((error) => {
        console.log(error);
      });

    // await connectSendTransport();
  };

  const handleConnect = () => {
    if (isConnected) {
      socket.disconnect();
      setIsConnected(false);
    } else {
      socket = io("http://localhost:8080", {
        transports: ["websocket"],
      });

      socket.on("connect", () => {
        setIsConnected(true);
      });

      socket.on("get:rtpCapabilities", (data) => {
        rtpCapabilities = data.rtpCapabilities;
      })

      socket.on("disconnect", () => {
        setIsConnected(false);
      });
    }
  };

  return (
    <div className="app">
      <PresenceIndicator isConnected={isConnected} />
      <Button handleClick={handleConnect}>
        {isConnected ? "Disconnect" : "Connect"}
      </Button>
      {isConnected && (
        <>
          <Button handleClick={handleGetAudio}>Send Audio</Button>
          <Button handleClick={createRecvTransport}>Receive Audio</Button>
        </>
      )}
      <figure>
        <figcaption>Listen to the Shit:</figcaption>
        <audio autoPlay ref={audioRef}></audio>
      </figure>
    </div>
  );
}

export default App;
