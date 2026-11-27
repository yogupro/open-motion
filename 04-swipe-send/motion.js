(() => {
  'use strict';

  const scene = document.querySelector('.scene');
  const screen = document.querySelector('.screen');
  const swipe = screen.querySelector('.swipe');
  const review = screen.querySelector('.review');
  const outline = screen.querySelector('.rail-outline');
  const hint = screen.querySelector('.release-hint');
  const sending = screen.querySelector('.sending-label');
  const sendingText = sending.firstElementChild;
  const receiptHost = screen.querySelector('.receipt');
  const status = screen.querySelector('[role=status]');
  const camera = screen.querySelector('.camera');
  const payment = {
    payee: review.querySelector('.recipient strong').textContent,
    amount: review.querySelector('.amount').textContent
  };
  sendingText.textContent = '正在向' + payment.payee + '转账';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const listen = (target, type, fn) => target.addEventListener(type, fn, { signal: events.signal });
  const clamp = value => Math.max(0, Math.min(1, value));
  function ease(start, end, value) {
    const x = clamp((value - start) / (end - start));
    return x * x * (3 - 2 * x);
  }

  const flightSeconds = 2.10;
  const receiptHold = 5;
  // Travel is measured in multiples of the visible rail. The last part of
  // the pull takes increasingly more finger movement for the same lift.
  const fullPull = 1.75;
  const armAt = 1.2;
  const disarmAt = .96;
  const preview = new URLSearchParams(location.search).has('preview');
  let phase = 'review';
  let action = preview && !preference.matches ? 'preview' : 'idle';
  let elapsed = 0;
  let sceneTime = 0;
  let progress = 0;
  let startProgress = 0;
  let grabPull = 0;
  let targetLift = 0;
  let liftVelocity = 0;
  let armed = false;
  let detentAt = -1;
  let scale = 1;
  let travel = 91;
  let pointer = null;
  let startY = 0;
  let focusReceipt = false;
  let visible = true;
  let frame = 0;
  let previousTime = null;

  function layout() {
    const width = scene.clientWidth;
    const height = scene.clientHeight;
    if (!width || !height) return;
    const full = width <= 600 && width / height < .68;
    scale = full ? width / 390 : Math.min(width * .92 / 422, height * .886 / 885, 1.23);
    const logicalHeight = full ? height / scale : 844;
    travel = logicalHeight * .108;
    scene.classList.toggle('edge-to-edge', full);
    scene.style.setProperty('--device-scale', scale);
    scene.style.setProperty('--screen-height', logicalHeight + 'px');
  }
  layout();
  const renderer = window.createSwipeRenderer(screen.querySelector('.light-field'));
  const receipt = window.createSwipeReceipt(receiptHost, reset, payment);

  function paint() {
    const reduced = preference.matches;
    const departure = phase === 'sending' ? elapsed : 0;
    if (phase !== 'success') {
      const lift = phase === 'sending'
        ? progress * (1 - .37 * ease(.05, .43, departure))
        : progress;
      const fade = 1 - ease(.30, .50, departure);
      screen.style.setProperty('--lift', (lift * travel).toFixed(2) + 'px');
      const strain = reduced ? 0 : ease(.18, 1, lift) * (1 - ease(0, .18, departure));
      const click = reduced || !armed ? 0 : Math.exp(-25 * (sceneTime - detentAt));
      swipe.style.setProperty('--squash', (1 - .075 * strain - .035 * click).toFixed(4));
      swipe.style.setProperty('--spread', (1 + .012 * strain).toFixed(4));
      review.style.opacity = fade;
      swipe.style.filter = departure ? 'blur(' + (4 * (1 - fade)) + 'px)' : '';
      outline.style.opacity = (.15 + .49 * progress) * (1 - ease(0, .32, departure));
      hint.style.opacity = ease(.25, .62, lift) * (1 - ease(.07, .37, departure));
      const ready = armed || action === 'completing' || phase === 'sending' || (action === 'preview' && progress > .85);
      const instruction = ready ? '松手确认转账' : '继续上滑';
      if (hint.textContent !== instruction) hint.textContent = instruction;
    }
    review.hidden = phase === 'success' || departure >= .50;
    if (phase === 'sending') {
      const ink = ease(.06, .70, elapsed);
      sending.style.opacity = 1 - ease(flightSeconds - .07, flightSeconds, elapsed);
      sendingText.style.clipPath = 'inset(0 ' + ((1 - ink) * 100).toFixed(2) + '% 0 0)';
      sendingText.style.filter = 'blur(' + (ease(flightSeconds - .08, flightSeconds, elapsed) * 3) + 'px)';
    } else {
      sending.style.opacity = 0;
    }
    if (phase === 'success') {
      receipt.update(elapsed, reduced);
      camera.style.opacity = reduced ? 1 : ease(.45, .86, elapsed);
      if (focusReceipt && (reduced || elapsed > .55)) {
        receiptHost.querySelector('button').focus({ preventScroll: true });
        focusReceipt = false;
      }
    } else {
      camera.style.opacity = 0;
    }
    renderer.draw({
      phase,
      progress: phase === 'review' ? progress : phase === 'sending' ? clamp(elapsed / flightSeconds) : elapsed,
      time: reduced ? 0 : sceneTime
    });
  }

  function setPhase(next, offset = 0) {
    phase = next;
    elapsed = offset;
    screen.dataset.phase = phase;
    swipe.disabled = phase !== 'review';
    receiptHost.hidden = phase !== 'success';
    review.inert = phase !== 'review';
    if (phase === 'sending') status.textContent = sendingText.textContent;
    if (phase === 'success') status.textContent = '转账成功。已转给' + payment.payee + ' ' + payment.amount + '。';
  }

  function launch(offset = 0) {
    progress = 1;
    action = 'idle';
    if (preference.matches) setPhase('success', receiptHold);
    else setPhase('sending', offset);
  }

  function advance(delta) {
    sceneTime += delta;
    elapsed += delta;
    if (phase === 'review') {
      if (action === 'preview') {
        progress = ease(1.15, 2.24, elapsed);
        if (elapsed >= 2.35) launch(elapsed - 2.35);
      } else if (action === 'dragging') {
        // Critical damping adds a little weight as the spring winds up.
        const rate = 50 - 17 * targetLift;
        const error = progress - targetLift;
        const tangent = liftVelocity + rate * error;
        const decay = Math.exp(-rate * delta);
        progress = preference.matches ? targetLift : clamp(targetLift + (error + tangent * delta) * decay);
        liftVelocity = preference.matches ? 0 : (liftVelocity - rate * tangent * delta) * decay;
      } else if (action === 'returning') {
        const x = 22 * elapsed;
        progress = clamp((startProgress * (1 + x) + liftVelocity * elapsed) * Math.exp(-x));
        if (progress < .001) {
          progress = 0;
          action = 'idle';
        }
      } else if (action === 'completing') {
        progress = startProgress + (1 - startProgress) * ease(0, .15, elapsed);
        if (elapsed >= .15) launch(elapsed - .15);
      }
    }
    if (phase === 'sending' && elapsed >= flightSeconds) {
      setPhase('success', elapsed - flightSeconds);
    }
    if (phase === 'success') elapsed = Math.min(receiptHold, elapsed);
  }

  function animated() {
    return phase === 'review' ? action !== 'idle'
      : phase === 'sending' || elapsed < receiptHold;
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    advance(previousTime === null ? 0 : Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    paint();
    if (animated()) frame = requestAnimationFrame(tick);
    else previousTime = null;
  }

  function wake() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function stopFrames() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
  }

  function reset() {
    stopFrames();
    const focusHandle = receiptHost.contains(document.activeElement);
    receipt.hide();
    action = 'idle';
    progress = sceneTime = 0;
    armed = false;
    liftVelocity = 0;
    setPhase('review');
    status.textContent = '已返回确认转账页';
    paint();
    if (focusHandle) swipe.focus({ preventScroll: true });
  }

  function settle(commit) {
    startProgress = progress;
    elapsed = 0;
    armed = false;
    if (commit) {
      if (preference.matches || progress >= .99) launch();
      else action = 'completing';
    } else if (preference.matches || !progress) {
      progress = 0;
      action = 'idle';
    } else {
      action = 'returning';
    }
    wake();
  }

  function takeOverPreview() {
    if (phase === 'review' && action === 'preview') settle(false);
  }

  listen(scene, 'pointerdown', takeOverPreview);
  listen(swipe, 'focus', takeOverPreview);
  listen(swipe, 'pointerdown', event => {
    if (phase !== 'review' || action === 'completing' || pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    startY = event.clientY;
    // Invert the resistance curve so re-grabbing mid-return preserves position.
    grabPull = fullPull * (1 - Math.pow(1 - progress, 1 / fullPull));
    targetLift = progress;
    liftVelocity = 0;
    armed = false;
    action = 'dragging';
    swipe.setPointerCapture(pointer);
    wake();
  });

  function track(y) {
    const pull = Math.max(0, grabPull + (startY - y) / (scale * travel));
    const nextArmed = armed ? pull >= disarmAt : pull >= armAt;
    if (nextArmed && !armed) detentAt = sceneTime;
    armed = nextArmed;
    const resistantLift = 1 - Math.pow(1 - clamp(pull / fullPull), fullPull);
    // The loaded handle slips a few pixels into the confirmation detent.
    targetLift = Math.min(1, resistantLift + (armed ? .035 : 0));
  }
  listen(swipe, 'pointermove', event => {
    if (event.pointerId !== pointer) return;
    track(event.clientY);
    wake();
  });
  function endDrag(event) {
    if (event.pointerId !== pointer) return;
    const released = event.type === 'pointerup';
    if (released) track(event.clientY);
    pointer = null;
    if (swipe.hasPointerCapture(event.pointerId)) swipe.releasePointerCapture(event.pointerId);
    settle(released && armed);
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => listen(swipe, type, endDrag));

  function keyboardSend() {
    if (phase !== 'review' || action === 'completing' || pointer !== null) return;
    focusReceipt = true;
    settle(true);
  }
  listen(swipe, 'click', event => { if (event.detail === 0) keyboardSend(); });
  listen(swipe, 'keydown', event => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      keyboardSend();
    }
  });
  listen(preference, 'change', () => {
    if (preference.matches) {
      if (phase === 'sending' || action === 'completing') launch();
      else if (phase === 'success') elapsed = receiptHold;
      else if (action !== 'dragging') {
        progress = 0;
        action = 'idle';
      }
    }
    wake();
  });

  function visibilityChanged() {
    if (document.hidden || !visible) {
      stopFrames();
      if (pointer !== null) {
        const id = pointer;
        pointer = null;
        if (swipe.hasPointerCapture(id)) swipe.releasePointerCapture(id);
        settle(false);
      }
    } else wake();
  }
  const viewport = new ResizeObserver(() => { layout(); wake(); });
  viewport.observe(scene);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visibilityChanged();
  });
  visibility.observe(scene);
  listen(document, 'visibilitychange', visibilityChanged);
  listen(window, 'pageshow', wake);
  listen(window, 'pagehide', event => {
    stopFrames();
    if (event.persisted) return;
    viewport.disconnect();
    visibility.disconnect();
    events.abort();
    receipt.destroy();
    renderer.destroy();
  });
  paint();
  wake();
})();
