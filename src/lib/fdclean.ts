// #54: a helper started through the Homebrew service inherits its sockets (fds 3 and up). This shell text closes every
// fd above 2 in the process that runs it; put it in the background part, before `exec nohup ...`. A shell that cannot
// name a two-digit fd (the check) skips it. Same idea as the `fdclean` function in the helper scripts (scripts/test-fdclean.sh).
export const FD_CLEAN_SH = 'if ( eval "exec 10>&-" ) 2>/dev/null; then for f in /proc/self/fd/*; do n=${f##*/}; case "$n" in \'\'|*[!0-9]*|0|1|2) ;; *) eval "exec $n>&-" 2>/dev/null;; esac; done; fi';

/** `( nohup <command> &)` with the inherited fds closed first, output and input detached. */
export function detached (command: string): string {
	return `( { ${FD_CLEAN_SH}; exec nohup ${command}; } >/dev/null 2>&1 </dev/null & )`;
}
