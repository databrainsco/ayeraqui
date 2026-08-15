import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

type Props = {
  active: boolean
  onError?: (message: string) => void
}

export type CameraViewHandle = {
  getVideo: () => HTMLVideoElement | null
}

const CONSTRAINTS: MediaStreamConstraints[] = [
  {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  },
  { audio: false, video: { facingMode: { ideal: 'environment' } } },
  { audio: false, video: { facingMode: 'environment' } },
  { audio: false, video: true },
]

async function openCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('unsupported')
  }
  let last: unknown
  for (const constraints of CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      last = err
    }
  }
  throw last instanceof Error ? last : new Error('camera')
}

export const CameraView = forwardRef<CameraViewHandle, Props>(
  function CameraView({ active, onError }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const [ready, setReady] = useState(false)

    useImperativeHandle(ref, () => ({
      getVideo: () => videoRef.current,
    }))

    useEffect(() => {
      if (!active) return

      let cancelled = false

      async function start() {
        try {
          const stream = await openCameraStream()
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          const video = videoRef.current
          if (!video) return

          video.setAttribute('playsinline', 'true')
          video.setAttribute('webkit-playsinline', 'true')
          video.muted = true
          video.playsInline = true
          video.srcObject = stream

          if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
            await new Promise<void>((resolve, reject) => {
              const onMeta = () => resolve()
              const onErr = () => reject(new Error('metadata'))
              video.addEventListener('loadedmetadata', onMeta, { once: true })
              video.addEventListener('error', onErr, { once: true })
            })
          }

          if (cancelled) return
          await video.play()
          setReady(true)
        } catch {
          onError?.(
            'No pudimos abrir la cámara. En iPhone: Ajustes → Safari → Cámara, o usa Chrome. Recarga e inténtalo otra vez.',
          )
        }
      }

      void start()

      return () => {
        cancelled = true
        setReady(false)
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (videoRef.current) videoRef.current.srcObject = null
      }
    }, [active, onError])

    return (
      <div className={`camera-stage ${ready ? 'is-ready' : ''}`}>
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
          autoPlay
        />
        {!ready && <div className="camera-loading">Abriendo cámara…</div>}
      </div>
    )
  },
)
