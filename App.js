import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Camera, useCameraDevices, useFrameProcessor } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Worklets } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Canvas, Path, Circle, Skia } from '@shopify/react-native-skia';

// Keypoint bağlantıları (17 keypoint için MoveNet bağlantı dizisi)
const skeletonConnections = [
  [0, 1], [0, 2], [1, 3], [2, 4],
  [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 6], [5, 11], [6, 12],
  [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16]
];

const { width, height } = Dimensions.get('window');

export default function App() {
  const [hasPermission, setHasPermission] = useState(false);
  const devices = useCameraDevices();
  const device = devices.back;
  const [keypoints, setKeypoints] = useState([]);

  const { resize } = useResizePlugin();

  // MoveNet Lightning INT8 modelini yükle
  const movenetPlugin = useTensorflowModel(require('./assets/4.tflite'));

  useEffect(() => {
    Camera.requestCameraPermission().then(status => setHasPermission(status === 'authorized'));
  }, []);

  // FrameProcessor içinde model çıkarımı + keypoint çıkışı
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';

    if (movenetPlugin.state !== 'loaded') return;

    const resized = resize(frame, {
      scale: { width: 192, height: 192 },
      pixelFormat: 'rgb',
      dataType: 'uint8',
    });

    const outputs = movenetPlugin.model.runSync([resized]); // Native hızlı çıkarım
    const output = outputs[0]; // [y0,x0,s0, y1,x1,s1, ...]
    const kpts = [];
    for (let i = 0; i < 17; i++) {
      const y = output[i * 3];
      const x = output[i * 3 + 1];
      const score = output[i * 3 + 2];
      if (score > 0.3) { // Güven skoru eşiği
        kpts.push({ x, y });
      } else {
        kpts.push(null); // Düşük güvenli noktalara null koy (çizim sırasında kontrol edilir)
      }
    }

    // JS tarafına aktar
    Worklets.runOnJS(setKeypoints)(kpts);

  }, [movenetPlugin]);

  // Skia ile iskelet ve keypoint çizimi
  const renderSkeleton = () => (
    <Canvas style={StyleSheet.absoluteFill}>
      {skeletonConnections.map(([i, j], idx) => {
        if (!keypoints[i] || !keypoints[j]) return null;
        const x1 = keypoints[i].x * width;
        const y1 = keypoints[i].y * height;
        const x2 = keypoints[j].x * width;
        const y2 = keypoints[j].y * height;
        const path = Skia.Path.Make();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        return <Path key={`line-${idx}`} path={path} color="white" style="stroke" strokeWidth={3} />;
      })}
      {keypoints.map((pt, idx) => pt && (
        <Circle
          key={`point-${idx}`}
          cx={pt.x * width}
          cy={pt.y * height}
          r={4}
          color="red"
        />
      ))}
    </Canvas>
  );

  if (!device) return null;

  return (
    <View style={styles.container}>
      {hasPermission && (
        <>
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            frameProcessor={frameProcessor}
            frameProcessorFps={30}
          />
          {renderSkeleton()}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});
