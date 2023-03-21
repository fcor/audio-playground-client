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
let users;

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let audioParams = {
  // mediasoup params
  encodings: [],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
};

const tracks = [];

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);

  async function connectRecvTransport(id) {
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
        producerId: id, // ID del producer al que me quiero conectar
        consumerTransportId: consumerTransport.id, // ID del consumer que quiero usar para recibir
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume");
          return;
        }

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

        tracks.push(track);

        audioRef.current.srcObject = new MediaStream(tracks);

        // the server consumer started with media paused
        // so we need to inform the server to resume
        socket.emit("consumerResume", { consumerId: consumer.id });
      }
    );
  }

  async function createRecvTransport() {
    if (!device) {
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
              await socket.emit("transportRecvConnect", {
                dtlsParameters,
                id: params.id,
              });
              callback();
            } catch (error) {
              errback(error);
            }
          }
        );
        handleReceiveAudio();
      }
    );
  }

  async function connectSendTransport() {
    producer = await producerTransport.produce(audioParams);

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
    socket.emit("request:webRtcTransport", { sender: true }, ({ params }) => {
      if (params.error) {
        console.log(params.error);
        return;
      }

      producerTransport = device.createSendTransport(params);

      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await socket.emit("transportConnect", {
              id: params.id,
              dtlsParameters,
            });

            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransport.on("produce", async (parameters, callback, errback) => {
        try {
          await socket.emit(
            "transportProduce",
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
              id: params.id,
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

  const handleReceiveAudio = async () => {
    console.log("Handle recv audio - num users: ", users.length);
    users.forEach((user) => {
      console.log("My id: ", socket.id);
      console.log("USR id: ", user.id);
      if (user.id !== socket.id) {
        console.log("Trying to connect to: ", user.id);
        connectRecvTransport(user.producerId);
      }
    });
  };

  const handleGetAudio = async () => {
    navigator.mediaDevices
      .getUserMedia({ video: false, audio: true })
      .then(async (stream) => {
        console.log("success stream request");
        const track = stream.getAudioTracks()[0];
        audioParams = {
          track,
          ...audioParams,
        };

        // Producing
        await createDevice(rtpCapabilities);
        await createSendTransport();

        // Consuming
        await createRecvTransport();
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const handleConnect = () => {
    if (isConnected) {
      socket.disconnect();
      setIsConnected(false);
    } else {
      socket = io("https://droplet-api.fjcr.pro/", {
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        setIsConnected(true);
      });

      socket.on("get:startingPackage", (data) => {
        console.log(data);
        rtpCapabilities = data.rtpCapabilities;
        users = data.users;
        handleGetAudio();
      });

      socket.on("newUser", (data) => {
        users.push(data);
        console.log("Trying to connect to: ", data.id);
        connectRecvTransport(data.producerId);
      });

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
      {/* {isConnected && (
        <>
          <Button handleClick={handleReceiveAudio}>Receive Audio</Button>
        </>
      )} */}
      <figure>
        {/* <figcaption>Listen to the Shit:</figcaption> */}
        <audio autoPlay ref={audioRef}></audio>
      </figure>
    </div>
  );
}

export default App;
