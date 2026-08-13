import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

type Props = {
  active: boolean
  onError?: (message: string) => void
}

export type CameraViewHandle = {
  getVideo: () => HTMLVideoElement | null
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
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          })
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          const video = videoRef.current
          if (video) {
            video.srcObject = stream
            await video.play()
            setReady(true)
          }
        } catch {
          onError?.(
            'No pudimos abrir la cámara. Revisa los permisos del navegador.',
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
