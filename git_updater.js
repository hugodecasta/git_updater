// -------------------------------------------------------------- IMPORTS

const child_process = require('child_process')
const fs = require('fs')

// -------------------------------------------------------------- VARS

const map_path = process.argv[3] || './systems.json'
if(!fs.existsSync(map_path)) {
    console.log('Systems map "'+map_path+'" missing')
    process.exit(1)
}

// -------------------------------------------------------------- FUNCTIONS

function rebase_sys_data(sys_data) {

    let sys_data_base = {
        dir:'.',
        executor:'node',
        script:'.',
        options:'',
        init_commands:[],
        update_secs:10
    }
    let final_sys_data = sys_data_base
    for(let prop in sys_data) {
        final_sys_data[prop] = sys_data[prop]
    }
    return final_sys_data
}

// -------------------------------------------------------------- CORE

let systems_map = JSON.parse(fs.readFileSync(map_path,'utf8'))

for(let sys_name in systems_map) {

    // --------------- LOGGER

    function log() {
        console.log('['+sys_name+']',Array.from(arguments).join(' '))
    }

    // --------------- LOADING

    let sys_data = rebase_sys_data(systems_map[sys_name])

    let git_connect = sys_data.git_connect
    let git_repo = sys_data.git_repo
    let dir = sys_data.dir
    let init_commands = sys_data.init_commands
    let executor = sys_data.executor
    let script = sys_data.script
    let options = sys_data.options
    let update_secs = sys_data.update_secs

    let git_dir = dir+'/'+git_repo

    let git_clone_options = ['clone',git_connect+'/'+git_repo,git_dir]
    let git_pull_options = ['-C',git_dir,'pull']

    // --------------- INIT COMMANDS

    function init() {
        log('init commands ...')
        for(let init_com of init_commands) {
            log('-',init_com)
            let com_sp = init_com.split(' ')
            let com = com_sp[0]
            let opt = com_sp.slice(1)
            child_process.spawnSync(com,opt)
        }
        log('init done !')
    }

    // --------------- CLONE ?

    let exec_option = [script].concat(options.split(' '))
    if(!fs.existsSync(git_dir)) {
        log('clone repo first ...')
        child_process.spawnSync('git',git_clone_options)
        log('repo cloned')
        init()
    }

    // --------------- UPDATER

    async function update_system() {

        let updater = child_process.spawn('git',git_pull_options)

        let full_data = []

        updater.stdout.on('data', function (data) {
            full_data.push(data.toString())
        });
        
        return new Promise(ok=>{
            updater.on('exit',function(code) {
                ok(full_data.length > 1)
            })
        })
    }

    // --------------- LAUNCHER

    let exec = null

    function restart_system() {

        log('starting system')
        if(exec != null) {
            log('closing first')
            exec.kill('SIGINT')
        }

        exec = child_process.spawn(executor,exec_option)

        exec.stdout.on('data', function (data) {
            log('{DATA}:',data.toString())
        });
        
        exec.on('exit',function(code) {
            log('{EXIT}:',code)
        })
    }

    // --------------- CORE

    async function updater() {
        let must_restart = await update_system()
        if(must_restart) {
            log('must restart after update')
            init()
            restart_system()
        }
    }

    restart_system()
    setInterval(updater,update_secs*1000)

}
