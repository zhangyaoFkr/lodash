import isObject from './isObject.js'
import root from './.internal/root.js'

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked, or until the next browser frame is drawn. The debounced function
 * comes with a `cancel` method to cancel delayed `func` invocations and a
 * `flush` method to immediately invoke them. Provide `options` to indicate
 * whether `func` should be invoked on the leading and/or trailing edge of the
 * `wait` timeout. The `func` is invoked with the last arguments provided to the
 * debounced function. Subsequent calls to the debounced function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * If `wait` is omitted in an environment with `requestAnimationFrame`, `func`
 * invocation will be deferred until the next frame is drawn (typically about
 * 16ms).
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `debounce` and `throttle`.
 *
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0]
 *  The number of milliseconds to delay; if omitted, `requestAnimationFrame` is
 *  used (if available).
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', debounce(calculateLayout, 150))
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }))
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * const debounced = debounce(batchLog, 250, { 'maxWait': 1000 })
 * const source = new EventSource('/stream')
 * jQuery(source).on('message', debounced)
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel)
 *
 * // Check for pending invocations.
 * const status = debounced.pending() ? "Pending..." : "Ready"
 */
function debounce(func, wait, options) {
  let lastArgs,
    lastThis,
    maxWait,
    result,
    timerId,
    lastCallTime

  // [options.leading=false] (boolean): 指定在延迟开始前调用。
  // [options.trailing=true] (boolean): 指定在延迟结束后调用。
  // 使用 leading 的场景, 轮询 api
  // 使用 trailing 的场景, input 等用户输入后处理
  // 默认在延时后调用
  let lastInvokeTime = 0
  let leading = false
  let maxing = false
  let trailing = true

  // Bypass `requestAnimationFrame` by explicitly setting `wait=0`.
  // 如果是浏览器 就可以使用 requestAnimationFrame
  const useRAF = (!wait && wait !== 0 && typeof root.requestAnimationFrame === 'function')

  if (typeof func !== 'function') {
    throw new TypeError('Expected a function')
  }
  wait = +wait || 0
  if (isObject(options)) {
    leading = !!options.leading
    maxing = 'maxWait' in options
    // 如果 options 中有 maxWait
    maxWait = maxing ? Math.max(+options.maxWait || 0, wait) : maxWait
    // 默认会在一个周期最后调用一次
    trailing = 'trailing' in options ? !!options.trailing : trailing
  }

  // 调用传入的方法
  function invokeFunc(time) {
    const args = lastArgs
    const thisArg = lastThis

    lastArgs = lastThis = undefined
    // 记录调用的时间作为上一次调用的时间
    lastInvokeTime = time
    // 调用方法并返回结果
    result = func.apply(thisArg, args)
    return result
  }

  function startTimer(pendingFunc, wait) {
    if (useRAF) {
      // 每次调用延时执行的时候 先清空上一次的 timer
      root.cancelAnimationFrame(timerId)
      return root.requestAnimationFrame(pendingFunc)
    }
    // 在非浏览器端使用 setTimeout
    return setTimeout(pendingFunc, wait)
  }

  function cancelTimer(id) {
    if (useRAF) {
      return root.cancelAnimationFrame(id)
    }
    clearTimeout(id)
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    // 记录上次调用 debounce 时间
    lastInvokeTime = time
    // Start the timer for the trailing edge.
    // 开启一个计时器
    // 传入一个方法 timerExpired
    timerId = startTimer(timerExpired, wait)
    // Invoke the leading edge.
    // 如果 option 的 leading 为 true, 立即调用 func
    // 同时 invokeFunc 中将 lastArgs 置为 undefined
    // 保证了 leading 的优先级更高
    return leading ? invokeFunc(time) : result
  }

  function remainingWait(time) {
    // 主要是计算还剩多少时间达到一个周期或 maxWait
    const timeSinceLastCall = time - lastCallTime

    const timeSinceLastInvoke = time - lastInvokeTime
    // 最后一次触发 debounce 的时间到这个周期最后的时间差
    const timeWaiting = wait - timeSinceLastCall

    // 如果有 maxWait 就取这两个最小的, 谁先到就调用谁
    return maxing
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting
  }

  function shouldInvoke(time) {
    // 第一次调用 debounce 的 lastCallTime & lastInvokeTime 都是 undefined
    // 上一次调用 debounce 和 上一次调用 func 与 now 的时间差
    const timeSinceLastCall = time - lastCallTime
    const timeSinceLastInvoke = time - lastInvokeTime

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    // 第一次 lastCallTime === undefined 为 true 会返回 true
    // 在每个 wait 时间内 频繁触发 debounce 会在第一次返回 true 第二次返回 false
    return (
      lastCallTime === undefined || // 第二次不是 undefined
      timeSinceLastCall >= wait || // 已经进入了下个周期; 频繁触发 debounce 的时候 有可能会小于 wait 并且 > 0
      timeSinceLastCall < 0 || // 在下一个时间段内调用了 debounce, 需要开启下一个 timeout
      (maxing && timeSinceLastInvoke >= maxWait) // 上次调用 func 的时间到当前时间 可能会小于 maxWait 返回 false, 为在到达 maxWait 时触发 func
    )
  }

  function timerExpired() {
    const time = Date.now()
    // 达到一次的时间周期 看下是否需要调用一次
    if (shouldInvoke(time)) {
      return trailingEdge(time)
    }
    // 如果当前 time 不满足需要调用的条件
    // Restart the timer.
    // 使用 setTimeout 递归的方式实现周期
    // 在有 maxWait 的情况下 shouldInvoke 方法可能会返回 false 导致在一个周期内没有执行一次
    // 再起一个计时器 在剩下的时间去执行一次
    timerId = startTimer(timerExpired, remainingWait(time))
  }

  function trailingEdge(time) {
    // 在每个 wait 末尾都会清除定时器
    timerId = undefined

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    // 如果需要在达到时间调用一次 & lastArgs 这个参数限制了 如果 leading 为 true 就是在延迟开始前调用
    // 调用 func 的时候 lastArgs 会置为 undefined
    // 并且 leading 为 true 的情况下 trailing 为 true 是失效的
    // 就是说 leading 的优先级比 trailing 高
    if (trailing && lastArgs) {
      return invokeFunc(time)
    }
    lastArgs = lastThis = undefined
    return result
  }

  function cancel() {
    if (timerId !== undefined) {
      cancelTimer(timerId)
    }
    lastInvokeTime = 0
    lastArgs = lastCallTime = lastThis = timerId = undefined
  }

  // 如果已经调用过了就返回 result
  // 在 wait 期间调用 flush 会返回 result, 之前就已经调用了 invokeFunc
  // trailingEdge 也会返回 result
  // 有 timerId 走 trailingEdge(Date.now())
  // 如果 trailing 为 false 返回 result
  function flush() {
    return timerId === undefined ? result : trailingEdge(Date.now())
  }

  function pending() {
    return timerId !== undefined
  }

  function debounced(...args) {
    // 每次触发函数都会获取当前时间
    const time = Date.now()
    // 根据条件看下是否需要调用
    const isInvoking = shouldInvoke(time)

    // 保存参数
    lastArgs = args
    // 保存 this 保证在调用 func 的时候 this 指向正确
    lastThis = this
    // 记录最后调用的时间
    lastCallTime = time

    // 首次为 true
    if (isInvoking) {
      // 第一次 timerId 为 undefined
      // 而在一个 wait 的时间段内 第二次 timerId 就不为 undefined 了
      if (timerId === undefined) {
        return leadingEdge(lastCallTime)
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        timerId = startTimer(timerExpired, wait)
        return invokeFunc(lastCallTime)
      }
    }
    // 在没有定时器的时候才起定时器
    if (timerId === undefined) {
      timerId = startTimer(timerExpired, wait)
    }
    return result
  }
  // 可以取消 debounce
  debounced.cancel = cancel
  // 立即调用一次
  debounced.flush = flush
  debounced.pending = pending
  // debounce 返回一个方法, 事件是调用该内部方法的
  // 利用闭包来存一些局部变量
  return debounced
}

export default debounce
